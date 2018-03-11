import { Math as _Math, WebGLRenderer, Vector3, Quaternion, Matrix4, DataTexture, FileLoader, RGBFormat, RGBAFormat, FloatType, BufferGeometry } from 'three'
import { GPUComputationRenderer } from './GPUComputationRenderer'

import calc_pose_error from './calc_pose_error.glsl'

import MotionRenderer from './MotionRenderer'

export default class MotionGraph {

    constructor(character, anims) {
        this.character = character
        this.anims = anims

        // 点群の重み
        this.weights = []

        this.transitionThreshold = 400
    }

    constructMotionGraph(animation) {

        let bufferGeometry = new BufferGeometry().fromGeometry(this.character.geometry)

        console.log(bufferGeometry.attributes)

        let vertexLength = bufferGeometry.attributes.position.count
        let vertexTextureSize = _Math.ceilPowerOfTwo(Math.sqrt(bufferGeometry.attributes.position.array.length / 3))
        let vertexArray = new Float32Array(vertexTextureSize * vertexTextureSize * 3)
        vertexArray.set(bufferGeometry.attributes.position.array)
        let vertexTexture = new DataTexture(
            vertexArray,
            vertexTextureSize,
            vertexTextureSize,
            RGBFormat,
            FloatType
        )
        vertexTexture.needsUpdate = true

        let skinIndicesTextureSize = Math.sqrt(bufferGeometry.attributes.skinIndex.array.length / 4)
        skinIndicesTextureSize = _Math.ceilPowerOfTwo(skinIndicesTextureSize)
        let skinIndicesArray = new Float32Array(skinIndicesTextureSize * skinIndicesTextureSize * 4)
        skinIndicesArray.set(bufferGeometry.attributes.skinIndex.array)
        let skinIndicesTexture = new DataTexture(
            skinIndicesArray,
            skinIndicesTextureSize,
            skinIndicesTextureSize,
            RGBAFormat,
            FloatType
        )
        skinIndicesTexture.needsUpdate = true

        let skinWeightsTextureSize = skinIndicesTextureSize
        let skinWeightsArray = new Float32Array(skinWeightsTextureSize * skinWeightsTextureSize * 4)
        skinWeightsArray.set(bufferGeometry.attributes.skinWeight.array)
        let skinWeightsTexture = new DataTexture(
            skinWeightsArray,
            skinWeightsTextureSize,
            skinWeightsTextureSize,
            RGBAFormat,
            FloatType
        )
        skinWeightsTexture.needsUpdate = true

        let hierarchyTracks = animation.hierarchy || []

        let motionTexture1Size = Math.sqrt(hierarchyTracks.length * hierarchyTracks[0].keys.length * 4); // 4 pixels needed for 1 matrix
        motionTexture1Size = _Math.ceilPowerOfTwo(motionTexture1Size)
        motionTexture1Size = Math.max(motionTexture1Size, 4)

        let motionMatrices = new Float32Array(motionTexture1Size * motionTexture1Size * 4) // 4 floats per RGBA pixel

        for (let h = 0; h < hierarchyTracks.length; h++) {

            let keys = hierarchyTracks[h].keys

            let tPos = new Vector3()
            let tRot = new Quaternion()
            let tScl = new Vector3(1, 1, 1)

            for (let a = 0; a < keys.length; a++) {

                let parent = hierarchyTracks[h].parent

                if (parent === -1) {
                    let offset = (h + a * hierarchyTracks.length) * 16

                    motionMatrices.set([
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1
                    ], offset)

                } else {

                    let parentKeys = hierarchyTracks[parent].keys

                    tPos.fromArray(parentKeys[a].pos || [0, 0, 0])
                    tRot.fromArray(parentKeys[a].rot || [0, 0, 0, 1])

                    let tMat = new Matrix4()
                    tMat.compose(tPos, tRot, tScl)

                    let offset = (parent + a * hierarchyTracks.length) * 16

                    let tpMat = new Matrix4()
                    tpMat.fromArray(motionMatrices, offset)

                    tMat.premultiply(tpMat)

                    offset = (h + a * hierarchyTracks.length) * 16
                    tMat.toArray(motionMatrices, offset)

                }

            }

        }

        console.log(`motionMatrices`)
        console.log(motionMatrices)

        let motionTexture1 = new DataTexture(
            motionMatrices,
            motionTexture1Size,
            motionTexture1Size,
            RGBAFormat,
            FloatType
        )
        motionTexture1.needsUpdate = true

        let motionTexture2 = new DataTexture(
            motionMatrices,
            motionTexture1Size,
            motionTexture1Size,
            RGBAFormat,
            FloatType
        )
        motionTexture2.needsUpdate = true

        let gpuComputeSize = hierarchyTracks[0].keys.length
        gpuComputeSize = _Math.ceilPowerOfTwo(gpuComputeSize)

        let renderer = MotionRenderer

        this.gpuCompute = new GPUComputationRenderer(hierarchyTracks[0].keys.length, hierarchyTracks[0].keys.length, renderer)
        const errorTexture = this.gpuCompute.createTexture()
        this.errorVariable = this.gpuCompute.addVariable("textureMotion1", calc_pose_error, errorTexture)
        this.gpuCompute.setVariableDependencies(this.errorVariable, [this.errorVariable])

        this.errorVariable.material.uniforms.vertexTexture = { value: vertexTexture }
        this.errorVariable.material.uniforms.vertexTextureSize = { value: vertexTextureSize }
        this.errorVariable.material.defines.VERTEX_LENGTH = vertexLength
        this.errorVariable.material.uniforms.skinIndicesTexture = { value: skinIndicesTexture }
        this.errorVariable.material.uniforms.skinWeightsTexture = { value: skinWeightsTexture }
        this.errorVariable.material.uniforms.skinIndicesTextureSize = { value: skinIndicesTextureSize }

        this.errorVariable.material.uniforms.motionTexture1 = { value: motionTexture1 }
        this.errorVariable.material.uniforms.motionTexture2 = { value: motionTexture2 }
        this.errorVariable.material.uniforms.motionTexture1Size = { value: motionTexture1Size }
        this.errorVariable.material.uniforms.motionTexture2Size = { value: motionTexture1Size }
        this.errorVariable.material.uniforms.boneSize = { value: hierarchyTracks.length }

        if (this.gpuCompute.init() !== null) {
            console.error(error)
        }

        this.gpuCompute.compute()

        let buffer = new Float32Array(hierarchyTracks[0].keys.length * hierarchyTracks[0].keys.length * 4);
        renderer.readRenderTargetPixels(this.gpuCompute.getCurrentRenderTarget(this.errorVariable), 0, 0, hierarchyTracks[0].keys.length, hierarchyTracks[0].keys.length, buffer)
        console.log(buffer)

        let errorTextureSize = hierarchyTracks[0].keys.length

        let cnt = 0
        let localMinimas = new Float32Array(errorTextureSize * errorTextureSize * 4)
        for (let i = 1; i < errorTextureSize - 1; i++) {
            for (let j = 1; j < errorTextureSize - 1; j++) {
                let pos = (i + errorTextureSize * j) * 4
                if (
                    buffer[pos] < buffer[pos - 4] &&
                    buffer[pos] < buffer[pos + 4] &&
                    buffer[pos] < buffer[pos - errorTextureSize * 4] &&
                    buffer[pos] < buffer[pos + errorTextureSize * 4]
                ) {
                    if (buffer[pos] <= this.transitionThreshold) {
                        localMinimas[pos] = 1
                        localMinimas[pos + 1] = 1
                        localMinimas[pos + 2] = 0
                        localMinimas[pos + 3] = 1
                        cnt++
                    }
                    console.log(`i:${i} j:${j}`)
                }
            }
        }
        console.log(localMinimas)
        console.log(cnt)

        return new DataTexture(localMinimas, hierarchyTracks[0].keys.length, hierarchyTracks[0].keys.length, RGBAFormat, FloatType)

    }

    generateMotionFromGraphWalk(graphWalk) {



    }

    synthesizePath(path) {

    }

}