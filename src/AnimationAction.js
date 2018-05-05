import { Vector2, Vector3, Quaternion, LinearInterpolant, CubicInterpolant, PropertyBinding, PropertyMixer, AnimationClip } from 'three'

export default class AnimationAction {

    constructor(root, clips) {

        this.clips = clips
        this.clip = clips[0]
        this._root = root
        this._bindings = []
        this._interpolants = {}

        let tracks = clips[0].tracks
        let nTracks = tracks.length
        for (let i = 0; i !== nTracks; i++) {

            let track = tracks[i]

            let binding = new PropertyMixer(
                PropertyBinding.create(root, track.name),
                track.ValueTypeName,
                track.getValueSize()
            )

            this._bindings.push(binding)

        }

        for (let clip of clips) {

            tracks = clip.tracks
            nTracks = tracks.length

            let interpolants = this._interpolants[clip.uuid] = []

            for (let i = 0; i !== nTracks; i++) {

                let track = tracks[i]

                let interpolant = track.createInterpolant(null)

                interpolant.resultBuffer = this._bindings[i].buffer

                interpolants.push(interpolant)

            }

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

        this.clipTransform
        this.nextClipTransform

        this.graphWalk = [
        ]
        this.graphWalkIdx = 0

        this.transitionDuration = 0.0005

    }

    setGraphWalk(graphWalk) {

        this.graphWalk = graphWalk

    }

    getGraphWalkTrajectory() {

        let rootTrajectory = []

        let prevNode = this.graphWalk.nodes[0]
        let node

        let prevClipTransform = this.getClipTransformFromPosDir(this.graphWalk.initialPos, this.graphWalk.initialDir, prevNode.sourceFrame, prevNode.clip)
        let clipTransform

        this.getTrajectory(prevNode.sourceFrame, prevNode.targetFrame, prevClipTransform, prevNode.clip, rootTrajectory)

        for (let i = 1, l = this.graphWalk.nodes.length; i < l; i++) {

            node = this.graphWalk.nodes[i]
            clipTransform = this.getClipTransform(prevNode.targetFrame, node.sourceFrame, prevClipTransform, prevNode.clip, node.clip)

            this.getTransitingTrajectory(prevNode.targetFrame, node.sourceFrame, prevClipTransform, clipTransform, prevNode.clip, node.clip, rootTrajectory)

            this.getTrajectory(node.sourceFrame, node.targetFrame, clipTransform, node.clip, rootTrajectory)

            prevNode = node
            prevClipTransform = clipTransform

        }

        return rootTrajectory

    }

    getTrajectory(sourceFrame, targetFrame, clipTransform, clip, targetArray = []) {

        let rootBinding = this._bindings[0]
        let interpolant = this._interpolants[clip.uuid][0]

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

    getTransitingTrajectory(sourceFrame, targetFrame, sourceClipTransform, targetClipTransform, sourceClip, targetClip, targetArray = []) {

        let rootBinding = this._bindings[0]
        let interpolant = this._interpolants[sourceClip.uuid][0]
        let targetInterpolant = this._interpolants[targetClip.uuid][0]

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
        let targetTimes = targetInterpolant.parameterPositions

        let accuIndex = 0

        for (let frame = 0; frame < frameLength; frame++) {
            let sourceFrameTime = times[sourceFrame + frame]
            let targetFrameTime = targetTimes[targetFrame - (frameLength - frame)]

            let weight = weightInterpolant.evaluate(frame)[0]

            interpolant.evaluate(sourceFrameTime)

            let pos = new Vector3()
            pos.fromArray(rootBinding.buffer)
            pos.sub(sourceClipTransform.clipPos)
            pos.applyQuaternion(sourceClipTransform.rootRotOffset)
            pos.add(sourceClipTransform.rootPos)
            pos.toArray(rootBinding.buffer)

            rootBinding.accumulate(accuIndex, weight)

            targetInterpolant.evaluate(targetFrameTime)

            pos.fromArray(rootBinding.buffer)
            pos.sub(targetClipTransform.clipPos)
            pos.applyQuaternion(targetClipTransform.rootRotOffset)
            pos.add(targetClipTransform.rootPos)
            pos.toArray(rootBinding.buffer)

            rootBinding.accumulate(accuIndex, 1 - weight)

            targetArray.push(new Vector2(rootBinding.buffer[3], rootBinding.buffer[5]))

            rootBinding.apply(accuIndex)

        }

        return targetArray

    }

    play() {

        this.graphWalkIdx = 0
        let node = this.graphWalk.nodes[this.graphWalkIdx]
        let sourceFrame = node.sourceFrame
        let targetFrame = node.targetFrame

        let tracks = node.clip.tracks
        this.clipTime = tracks[0].times[sourceFrame]

        this.clipTransform = this.getClipTransformFromPosDir(this.graphWalk.initialPos, this.graphWalk.initialDir, node.sourceFrame, node.clip)

        let nextNode = this.graphWalk.nodes[this.graphWalkIdx + 1]
        if (nextNode) {
            this.reserveTransition(targetFrame, nextNode.sourceFrame, node.clip, nextNode.clip, this.transitionDuration)
        }

    }
    getClipTransformFromPosDir(pos, dir, frame, clip) {

        let interpolant = this._interpolants[clip.uuid][0]

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

    getClipTransform(sourceFrame, targetFrame, prevTransform, sourceClip, targetClip) {

        let interpolant = this._interpolants[sourceClip.uuid][0]
        let rotInterpolant = this._interpolants[sourceClip.uuid][1]
        let targetInterpolant = this._interpolants[targetClip.uuid][0]
        let rotTargetInterpolant = this._interpolants[targetClip.uuid][1]

        let clipPos = new Vector3()
        let rootPos = new Vector3()
        let rootRotOffset = new Quaternion()

        let source = interpolant.sampleValues
        let target = targetInterpolant.sampleValues
        clipPos.fromArray(target, targetFrame * 3)

        let targetRot = new Quaternion()
        targetRot.fromArray(rotTargetInterpolant.sampleValues, targetFrame * 4)
        rootRotOffset.fromArray(rotInterpolant.sampleValues, sourceFrame * 4)
        rootRotOffset.premultiply(prevTransform.rootRotOffset)
        rootRotOffset.multiply(targetRot.inverse())

        let tv = new Vector3(1, 0, 0)
        tv.applyQuaternion(rootRotOffset)
        tv.projectOnPlane(new Vector3(0, 1, 0))
        rootRotOffset.setFromUnitVectors(new Vector3(1, 0, 0), tv)

        rootPos.fromArray(source, sourceFrame * 3)

        let targetPos = new Vector3()
        targetPos.fromArray(target, (targetFrame - Math.floor(this.transitionDuration * 120)) * 3)
        targetPos.subVectors(clipPos, targetPos)
        targetPos.multiplyScalar(0.5)
        targetPos.applyQuaternion(rootRotOffset)

        let transitPos = new Vector3()
        transitPos.fromArray(source, (sourceFrame - Math.floor(this.transitionDuration * 120)) * 3)
        transitPos.subVectors(rootPos, transitPos)
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

    reserveTransition(sourceFrame, targetFrame, sourceClip, targetClip, duration) {

        let interpolant = this._weightInterpolant
        let times = interpolant.parameterPositions
        let values = interpolant.sampleValues

        let startTime = this._interpolants[sourceClip.uuid][0].parameterPositions[sourceFrame]

        times[0] = startTime
        times[1] = startTime + duration
        values[0] = 1
        values[1] = 0

        let tracks = targetClip.tracks
        let nTracks = tracks.length

        this._isTransiting = true

        let clipTransform = this.clipTransform

        let nextClipTransform = this.getClipTransform(sourceFrame, targetFrame, clipTransform, sourceClip, targetClip)

        console.log({...nextClipTransform})

        this.nextClipTransform = nextClipTransform

        this.nextClipTime = targetClip.tracks[0].times[targetFrame] - duration

    }

    update(deltaTime) {

        let weight = this._updateWeight()

        let clipTime = this.clipTime += deltaTime
        let accuIndex = this._accuIndex ^= 1
        let bindings = this._bindings

        let node = this.graphWalk.nodes[this.graphWalkIdx]
        let clipTransform = this.clipTransform

        for (let i = 0; i !== bindings.length; i++) {

            let interpolant = this._interpolants[node.clip.uuid][i]

            interpolant.evaluate(clipTime)

            if (bindings[i].binding.path === ".bones[root].position") {
                let pos = new Vector3()
                pos.fromArray(interpolant.resultBuffer)
                pos.sub(clipTransform.clipPos)
                pos.applyQuaternion(clipTransform.rootRotOffset)
                pos.add(clipTransform.rootPos)
                pos.toArray(interpolant.resultBuffer)
            } else if (bindings[i].binding.path === ".bones[root].quaternion") {
                let rot = new Quaternion()
                rot.fromArray(interpolant.resultBuffer)
                rot.premultiply(clipTransform.rootRotOffset)
                rot.toArray(interpolant.resultBuffer)
            }

            bindings[i].accumulate(accuIndex, weight)

        }


        if (this._isTransiting && weight !== 1) {

            let nextClipTime = this.nextClipTime += deltaTime
            let nextNode = this.graphWalk.nodes[this.graphWalkIdx + 1]
            let nextClipTransform = this.nextClipTransform

            for (let i = 0; i !== bindings.length; i++) {

                let interpolant = this._interpolants[nextNode.clip.uuid][i]

                interpolant.evaluate(nextClipTime)

                if (bindings[i].binding.path === ".bones[root].position") {
                    let pos = new Vector3()
                    pos.fromArray(interpolant.resultBuffer)
                    pos.sub(nextClipTransform.clipPos)
                    pos.applyQuaternion(nextClipTransform.rootRotOffset)
                    pos.add(nextClipTransform.rootPos)
                    pos.toArray(interpolant.resultBuffer)
                } else if (bindings[i].binding.path === ".bones[root].quaternion") {
                    let rot = new Quaternion()
                    rot.fromArray(interpolant.resultBuffer)
                    rot.premultiply(nextClipTransform.rootRotOffset)
                    rot.toArray(interpolant.resultBuffer)
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

            this.clipTransform = this.nextClipTransform

            this._isTransiting = false

            this.graphWalkIdx++
            let node = this.graphWalk.nodes[this.graphWalkIdx]
            let nextNode = this.graphWalk.nodes[this.graphWalkIdx + 1]
            if (nextNode) {
                this.reserveTransition(node.targetFrame, nextNode.sourceFrame, node.clip, nextNode.clip, this.transitionDuration)
            }

            return 1

        }

        let weight = interpolant.evaluate(this.clipTime)[0]

        return weight

    }

}