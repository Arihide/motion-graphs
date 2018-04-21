import { Vector2, Vector3, Quaternion, LinearInterpolant, CubicInterpolant, PropertyBinding, PropertyMixer, AnimationClip } from 'three'

export default class AnimationAction {

    constructor(root, clip) {

        this.clip = clip // Currentry only supports single clip
        this._root = root
        this._bindings = []
        this._interpolants = []

        let tracks = clip.tracks
        let nTracks = tracks.length
        for (let i = 0; i !== nTracks; i++) {

            let track = tracks[i]

            let interpolant = track.createInterpolant(null)

            let binding = new PropertyMixer(
                PropertyBinding.create(root, track.name),
                track.ValueTypeName,
                track.getValueSize()
            )

            interpolant.resultBuffer = binding.buffer

            this._bindings.push(binding)
            this._interpolants.push(interpolant)

        }

        this._accuIndex = 0
        this._isTransiting = false
        this._weightInterpolant = new CubicInterpolant(
            new Float32Array(2),
            new Float32Array(2),
            1
        )

        this.clipTime = 0
        this.nextClipTime = 0

        this._rootPos = new Vector3(0, 0, 0)
        this._rootRotOffset = new Quaternion(0, 0, 0, 1)

        this._nextRootPos = new Vector3()
        this._nextRootRotOffset = new Quaternion()

        this._clipPos = new Vector3(0, 0, 0)
        this._nextClipPos = new Vector3()

        this.graphWalk = [
        ]
        this.graphWalkIdx = 0

        this.transitionDuration = 0.5

    }

    setGraphWalk(graphWalk) {

        this.graphWalk = graphWalk

    }

    getGraphWalkTrajectory() {

        let rootTrajectory = []

        let prevNode = this.graphWalk.nodes[0]
        let node

        let prevClipTransform = this.getClipTransformFromPosDir(this.graphWalk.initialPos, this.graphWalk.initialDir, prevNode.sourceFrame)
        let clipTransform

        this.getTrajectory(prevNode.sourceFrame, prevNode.targetFrame, prevClipTransform, rootTrajectory)

        console.log([...rootTrajectory])

        for (let i = 1, l = this.graphWalk.nodes.length; i < l; i++) {

            node = this.graphWalk.nodes[i]
            clipTransform = this.getClipTransform(prevNode.targetFrame, node.sourceFrame, prevClipTransform)

            this.getTransitingTrajectory(prevNode.targetFrame, node.sourceFrame, prevClipTransform, clipTransform, rootTrajectory)
            
            this.getTrajectory(node.sourceFrame, node.targetFrame, clipTransform, rootTrajectory)

            prevNode = node
            prevClipTransform = clipTransform

        }

        return rootTrajectory

    }

    getTrajectory(sourceFrame, targetFrame, clipTransform, targetArray = []) {

        let rootBinding = this._bindings[0]
        let interpolant = this._interpolants[0]
        let rotInterpolant = this._interpolants[1]

        let times = interpolant.parameterPositions

        let clipPos = clipTransform.clipPos
        let rootPos = clipTransform.rootPos
        let rootRotOffset = clipTransform.rootRotOffset

        for (let frame = sourceFrame; frame <= targetFrame; frame++) {

            let time = times[frame]

            interpolant.evaluate(time)

            let pos = new Vector3()
            pos.fromArray(interpolant.resultBuffer)
            pos.sub(clipPos)
            pos.applyQuaternion(rootRotOffset)
            pos.add(rootPos)
            pos.toArray(interpolant.resultBuffer)

            rootBinding.accumulate(0, 1)

            targetArray.push(new Vector2(rootBinding.buffer[3], rootBinding.buffer[5]))

            rootBinding.apply(0)

        }

        return targetArray

    }

    getTransitingTrajectory(sourceFrame, targetFrame, sourceClipTransform, targetClipTransform, targetArray = []) {

        let rootBinding = this._bindings[0]
        let interpolant = this._interpolants[0]
        let rotInterpolant = this._interpolants[1]

        let frameLength = Math.floor(120 * this.transitionDuration)

        let weightInterpolant = this._weightInterpolant
        {
            let times = weightInterpolant.parameterPositions
            let values = weightInterpolant.sampleValues

            let startTime = interpolant.parameterPositions[sourceFrame]

            times[0] = 0
            times[1] = frameLength
            values[0] = 1
            values[1] = 0
        }

        let times = interpolant.parameterPositions


        let accuIndex = 0

        for (let frame = 0; frame < frameLength; frame++) {
            let sourceFrameTime = times[sourceFrame + frame]
            let targetFrameTime = times[targetFrame - (frameLength - frame)]

            let weight = weightInterpolant.evaluate(frame)[0]

            interpolant.evaluate(sourceFrameTime)

            let pos = new Vector3()
            pos.fromArray(interpolant.resultBuffer)
            pos.sub(sourceClipTransform.clipPos)
            pos.applyQuaternion(sourceClipTransform.rootRotOffset)
            pos.add(sourceClipTransform.rootPos)
            pos.toArray(interpolant.resultBuffer)

            rootBinding.accumulate(accuIndex, weight)

            interpolant.evaluate(targetFrameTime)

            pos.fromArray(interpolant.resultBuffer)
            pos.sub(targetClipTransform.clipPos)
            pos.applyQuaternion(targetClipTransform.rootRotOffset)
            pos.add(targetClipTransform.rootPos)
            pos.toArray(interpolant.resultBuffer)

            rootBinding.accumulate(accuIndex, 1 - weight)

            targetArray.push(new Vector2(rootBinding.buffer[3], rootBinding.buffer[5]))

            rootBinding.apply(accuIndex)

        }

        return targetArray

    }

    play() {

        this.graphWalkIdx = 0
        let node = this.graphWalk.nodes[this.graphWalkIdx]
        let clip = this.clip
        let sourceFrame = node.sourceFrame
        let targetFrame = node.targetFrame

        let tracks = clip.tracks

        this.clipTime = tracks[0].times[sourceFrame]

        this._clipPos.fromArray(clip.tracks[0].values, sourceFrame * 3)
        this._rootPos.copy(this._clipPos)
        this._rootPos.x = this.graphWalk.initialPos.x
        this._rootPos.z = this.graphWalk.initialPos.y

        let dir = new Vector3()
        dir.fromArray(clip.tracks[0].values, sourceFrame * 3 + 3)
        dir.sub(this._clipPos)
        dir.y = 0
        dir.normalize()

        this._rootRotOffset.setFromUnitVectors(dir, new Vector3(this.graphWalk.initialDir.x, 0, this.graphWalk.initialDir.y))

        let nextNode = this.graphWalk.nodes[++this.graphWalkIdx]
        if (nextNode) {
            this.reserveTransition(targetFrame, nextNode.sourceFrame, clip, this.transitionDuration)
        }

    }
    getClipTransformFromPosDir(pos, dir, frame) {

        let interpolant = this._interpolants[0]

        let clipPos = new Vector3()
        let rootPos = new Vector3()
        let rootRotOffset = new Quaternion()

        let target = interpolant.sampleValues
        clipPos.fromArray(target, frame * 3)

        rootPos.copy(clipPos)
        rootPos.x = pos.x
        rootPos.z = pos.y

        let d = new Vector3()
        d.fromArray(target, frame * 3 + 3)
        d.sub(clipPos)
        d.y = 0
        d.normalize()

        rootRotOffset.setFromUnitVectors(d, new Vector3(dir.x, 0, dir.y))

        return {
            clipPos: clipPos,
            rootPos: rootPos,
            rootRotOffset: rootRotOffset
        }

    }

    getClipTransform(sourceFrame, targetFrame, prevTransform) {

        let interpolant = this._interpolants[0]
        let rotInterpolant = this._interpolants[1]

        let clipPos = new Vector3()
        let rootPos = new Vector3()
        let rootRotOffset = new Quaternion()

        let target = interpolant.sampleValues
        clipPos.fromArray(target, targetFrame * 3)

        let targetRot = new Quaternion()
        targetRot.fromArray(rotInterpolant.sampleValues, targetFrame * 4)
        rootRotOffset.fromArray(rotInterpolant.sampleValues, sourceFrame * 4)
        rootRotOffset.premultiply(prevTransform.rootRotOffset)
        rootRotOffset.multiply(targetRot.inverse())

        let tv = new Vector3(1, 0, 0)
        tv.applyQuaternion(rootRotOffset)
        tv.projectOnPlane(new Vector3(0, 1, 0))
        rootRotOffset.setFromUnitVectors(new Vector3(1, 0, 0), tv)

        rootPos.fromArray(target, sourceFrame * 3)

        let targetPos = new Vector3()
        targetPos.fromArray(target, (targetFrame - Math.floor(this.transitionDuration * 120)) * 3)
        targetPos.subVectors(clipPos, targetPos)
        targetPos.multiplyScalar(0.5)
        targetPos.applyQuaternion(rootRotOffset)

        let transitPos = new Vector3()
        transitPos.fromArray(target, (sourceFrame + Math.floor(this.transitionDuration * 120)) * 3)
        transitPos.subVectors(transitPos, rootPos)
        transitPos.multiplyScalar(0.5)
        transitPos.applyQuaternion(prevTransform.rootRotOffset)

        rootPos.sub(prevTransform.clipPos)
        rootPos.applyQuaternion(prevTransform.rootRotOffset)
        rootPos.add(prevTransform.rootPos)
        
        rootPos.add(targetPos)
        rootPos.add(transitPos)

        return {
            clipPos: clipPos,
            rootPos: rootPos,
            rootRotOffset: rootRotOffset
        }

    }

    reserveTransition(sourceFrame, targetFrame, targetClip, duration) {

        let interpolant = this._weightInterpolant
        let times = interpolant.parameterPositions
        let values = interpolant.sampleValues

        let startTime = this._interpolants[0].parameterPositions[sourceFrame]

        times[0] = startTime
        times[1] = startTime + duration
        values[0] = 1
        values[1] = 0

        let tracks = targetClip.tracks
        let nTracks = tracks.length

        this._isTransiting = true

        let clipTransform = {
            clipPos: this._clipPos,
            rootPos: this._rootPos,
            rootRotOffset: this._rootRotOffset
        }

        let nextClipTransform = this.getClipTransform(sourceFrame, targetFrame, clipTransform)

        this._nextClipPos.copy(nextClipTransform.clipPos)
        this._nextRootPos.copy(nextClipTransform.rootPos)
        this._nextRootRotOffset.copy(nextClipTransform.rootRotOffset)

        this.nextClipTime = targetClip.tracks[0].times[targetFrame] - duration

    }

    update(deltaTime) {

        let weight = this._updateWeight()

        let clipTime = this.clipTime += deltaTime
        let accuIndex = this._accuIndex ^= 1
        let bindings = this._bindings

        for (let i = 0; i !== bindings.length; i++) {

            let interpolant = this._interpolants[i]

            interpolant.evaluate(clipTime)

            if (bindings[i].binding.path === ".bones[root].position") {
                let pos = new Vector3()
                pos.fromArray(interpolant.resultBuffer)
                pos.sub(this._clipPos)
                pos.applyQuaternion(this._rootRotOffset)
                pos.add(this._rootPos)
                pos.toArray(interpolant.resultBuffer)
            } else if (bindings[i].binding.path === ".bones[root].quaternion") {
                let rot = new Quaternion()
                rot.fromArray(interpolant.resultBuffer)
                rot.premultiply(this._rootRotOffset)
                rot.toArray(interpolant.resultBuffer)
            }

            bindings[i].accumulate(accuIndex, weight)

        }


        if (this._isTransiting && weight !== 1) {

            let nextClipTime = this.nextClipTime += deltaTime

            for (let i = 0; i !== bindings.length; i++) {

                this._interpolants[i].evaluate(nextClipTime)

                if (bindings[i].binding.path === ".bones[root].position") {
                    let pos = new Vector3()
                    pos.fromArray(this._interpolants[i].resultBuffer)
                    pos.sub(this._nextClipPos)
                    pos.applyQuaternion(this._nextRootRotOffset)
                    pos.add(this._nextRootPos)
                    pos.toArray(this._interpolants[i].resultBuffer)
                } else if (bindings[i].binding.path === ".bones[root].quaternion") {
                    let rot = new Quaternion()
                    rot.fromArray(this._interpolants[i].resultBuffer)
                    rot.premultiply(this._nextRootRotOffset)
                    rot.toArray(this._interpolants[i].resultBuffer)
                }

                bindings[i].accumulate(accuIndex, 1 - weight)

            }

        }

        for (let i = 0; i !== bindings.length; i++) {

            bindings[i].apply(accuIndex)

        }

        return this

    }

    _updateWeight() {

        if (!this._isTransiting) return 1

        let interpolant = this._weightInterpolant

        if (this.clipTime > interpolant.parameterPositions[1]) {

            console.log('transited!')

            this.clipTime = this.nextClipTime
            this._rootPos.copy(this._nextRootPos)
            this._clipPos.copy(this._nextClipPos)
            this._rootRotOffset.copy(this._nextRootRotOffset)

            this._isTransiting = false

            let node = this.graphWalk.nodes[this.graphWalkIdx]
            let nextNode = this.graphWalk.nodes[++this.graphWalkIdx]
            if (nextNode) {
                this.reserveTransition(node.targetFrame, nextNode.sourceFrame, this.clip, this.transitionDuration)
            }

            return 1

        }

        let weight = interpolant.evaluate(this.clipTime)[0]

        return weight

    }

}