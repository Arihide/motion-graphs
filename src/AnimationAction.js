import { Vector3, Quaternion, LinearInterpolant, CubicInterpolant, PropertyBinding, PropertyMixer, AnimationClip } from 'three'

export default class AnimationAction {

    constructor(root) {

        this._root = root
        this._bindings = []
        this._interpolants = []
        this._nextInterpolants = []

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

        this.clips = {}

        this.graphWalk = [
            { sourceFrame: 0, targetFrame: 0, clip: 0 },
            { sourceFrame: 0, targetFrame: 0, clip: 0 }
        ]
        this.graphWalkIdx = 0

        this.transitionDuration = 0.001

    }

    setGraphWalk(graphWalk) {

        this.graphWalk = graphWalk

    }

    play() {

        let node = this.graphWalk[this.graphWalkIdx]
        let clip = node.clip
        let sourceFrame = node.sourceFrame
        let targetFrame = node.targetFrame

        console.log(clip)

        let tracks = clip.tracks
        let nTracks = tracks.length

        this.clipTime = tracks[0].times[sourceFrame]

        for (let i = 0; i !== nTracks; i++) {

            let track = tracks[i]

            let interpolant = track.createInterpolant(null)

            let binding = new PropertyMixer(
                PropertyBinding.create(this._root, track.name),
                track.ValueTypeName,
                track.getValueSize()
            )

            interpolant.resultBuffer = binding.buffer

            this._bindings.push(binding)
            this._interpolants.push(interpolant)

        }

        let nextNode = this.graphWalk[++this.graphWalkIdx]
        if (nextNode) {
            this.transit(targetFrame, nextNode.sourceFrame, clip, this.transitionDuration)
        }

    }

    transit(sourceFrame, targetFrame, targetClip, duration) {

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

        for (let i = 0; i !== nTracks; i++) {

            let track = tracks[i]

            let interpolant = track.createInterpolant(null)

            interpolant.resultBuffer = this._bindings[i].buffer

            this._nextInterpolants.push(interpolant)

        }

        this._isTransiting = true

        let target = targetClip.tracks[0].values
        this._nextClipPos.fromArray(target, targetFrame * 3)

        this._nextRootRotOffset.fromArray(this._interpolants[1].evaluate(times[1]))
        let targetRot = new Quaternion()
        targetRot.fromArray(targetClip.tracks[1].values, targetFrame * 4)
        this._nextRootRotOffset.premultiply(this._rootRotOffset)
        this._nextRootRotOffset.multiply(targetRot.inverse())

        let tv = new Vector3(1, 0, 0)
        tv.applyQuaternion(this._nextRootRotOffset)
        tv.projectOnPlane(new Vector3(0, 1, 0))
        this._nextRootRotOffset.setFromUnitVectors(new Vector3(1, 0, 0), tv)

        this.nextClipTime = targetClip.tracks[0].times[targetFrame] - duration
        this._nextRootPos.fromArray(this._interpolants[0].evaluate(times[1]))
        this._nextRootPos.sub(this._clipPos)
        this._nextRootPos.applyQuaternion(this._rootRotOffset)
        this._nextRootPos.add(this._rootPos)

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

                this._nextInterpolants[i].evaluate(nextClipTime)

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

        if (this.clipTime > interpolant.parameterPositions[1]) { //何回も呼ばれてる

            console.log('transited!')

            this._interpolants = this._nextInterpolants
            this.clipTime = this.nextClipTime
            this._rootPos.copy(this._nextRootPos)
            this._clipPos.copy(this._nextClipPos)
            this._rootRotOffset.copy(this._nextRootRotOffset)

            this._isTransiting = false

            this._nextInterpolants = []

            let node = this.graphWalk[this.graphWalkIdx]
            let nextNode = this.graphWalk[++this.graphWalkIdx]
            if (nextNode) {
                this.transit(node.targetFrame, nextNode.sourceFrame, nextNode.clip, this.transitionDuration)
            }

            return 1

        }


        let weight = interpolant.evaluate(this.clipTime)[0]

        return weight

    }

}