import { Vector3, Quaternion, LinearInterpolant, CubicInterpolant, PropertyBinding, PropertyMixer, AnimationClip } from 'three'

export default class AnimationAction {

    constructor(root) {

        this._root = root
        this._bindings = []
        this._interpolants = []
        this._nextInterpolants = []

        this._accuIndex = 0
        this._isTransiting = false
        this._weightInterpolantResultBuffer = new Float32Array(1)
        this._weightInterpolant = new CubicInterpolant(
            new Float32Array(2),
            new Float32Array(2),
            1,
            this._weightInterpolantResultBuffer
        )

        this.clipTime = 0
        this.nextClipTime = 0

        this._rootPos = new Vector3(20, 0, 20)
        this._rootRot = new Quaternion()

        this._nextRootPos = new Vector3()
        this._nextRootRot = new Quaternion()

    }

    clipAction(clip) {

        let tracks = clip.tracks
        let nTracks = tracks.length

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

    }

    transit(targetClip, targetFrame, duration, sourceFrame) {

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

        this.nextClipTime = targetClip.tracks[0].times[targetFrame]
        this._nextRootPos.fromArray(this._interpolants[0].evaluate(times[1]))
        let target = targetClip.tracks[0].values
        this._rootPos.fromArray(target, targetFrame * 3)

        this._nextRootRot.fromArray(this._interpolants[1].evaluate(times[1]))
        let targetRot = new Quaternion()
        targetRot.fromArray(targetClip.tracks[1].values, targetFrame * 4)
        this._nextRootRot.multiply(targetRot.inverse())

        let tv = new Vector3(1, 0, 0)
        tv.applyQuaternion(this._nextRootRot)
        tv.projectOnPlane(new Vector3(0, 1, 0))
        this._nextRootRot.setFromUnitVectors(new Vector3(1, 0, 0), tv)

        console.log('start transiting')
        console.log(tv)

    }

    update(deltaTime) {

        let clipTime = this.clipTime += deltaTime
        let accuIndex = this._accuIndex ^= 1
        let bindings = this._bindings

        let weight = this._updateWeight()

        console.log(weight)

        for (let i = 0; i !== bindings.length; i++) {

            this._interpolants[i].evaluate(clipTime)

            if (bindings[i].binding.path === ".bones[root].position") {
                // this._interpolants[i].resultBuffer[0] -= this._rootPos.x
                // this._interpolants[i].resultBuffer[1] -= this._rootPos.y
                // this._interpolants[i].resultBuffer[2] -= this._rootPos.z
            }

            bindings[i].accumulate(accuIndex, weight)

        }

        if (this._isTransiting && weight !==1) {

            let nextClipTime = this.nextClipTime += deltaTime

            for (let i = 0; i !== bindings.length; i++) {

                this._nextInterpolants[i].evaluate(nextClipTime)

                if (bindings[i].binding.path === ".bones[root].position") {
                    let pos = new Vector3()
                    pos.fromArray(this._interpolants[i].resultBuffer)
                    pos.sub(this._rootPos)
                    pos.applyQuaternion(this._nextRootRot)
                    pos.add(this._nextRootPos)
                    pos.toArray(this._interpolants[i].resultBuffer)
                } else if (bindings[i].binding.path === ".bones[root].quaternion") {
                    let rot = new Quaternion()
                    rot.fromArray(this._interpolants[i].resultBuffer)
                    rot.premultiply(this._nextRootRot)
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

        let weight = interpolant.evaluate(this.clipTime)[0]

        if (this.time > interpolant.parameterPositions[1]) {

            this._isTransiting = false

        }

        return weight

    }

}