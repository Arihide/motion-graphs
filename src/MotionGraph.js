import { Math as _Math, WebGLRenderer, Vector3, Quaternion, Matrix4, DataTexture, FileLoader, RGBAFormat, FloatType, BufferGeometry } from 'three'
import { GPUComputationRenderer } from './GPUComputationRenderer'

import calc_pose_error from './calc_pose_error.glsl'

export default class MotionGraph {

    constructor(character) {
        this.character = character
        // this.clip = clip

        // 点群の重み
        this.weights = []

        this.transitionThreshold = 0
    }

    constructMotionGraph(animation) {

        let bufferGeometry = new BufferGeometry().fromGeometry(this.character.geometry)
        console.log(bufferGeometry)

        let vertexTexture = new DataTexture(
            bufferGeometry.attributes.position
        )

        let skinIndicesTextureSize = Math.sqrt(bufferGeometry.attributes.skinIndex.array.length)
        skinIndicesTextureSize = _Math.ceilPowerOfTwo(skinIndicesTextureSize)
        let skinIndicesTexture = new DataTexture(
            this.character.geometry.skinIndices,
            skinIndicesTextureSize,
            skinIndicesTextureSize,
            RGBAFormat,
            FloatType
        )

        let skinWeightsTextureSize = skinIndicesTextureSize
        let skinWeightsTexture = new DataTexture(
            this.character.geometry.skinWeights,
            skinWeightsTextureSize,
            skinWeightsTextureSize,
            RGBAFormat,
            FloatType
        )

        let hierarchyTracks = animation.hierarchy || []

        let size = Math.sqrt(hierarchyTracks.length * hierarchyTracks[0].keys.length * 4); // 4 pixels needed for 1 matrix
        size = _Math.ceilPowerOfTwo(size)
        size = Math.max(size, 4)

        let motionMatrices = new Float32Array(size * size * 4) // 4 floats per RGBA pixel

        for (let h = 0; h < hierarchyTracks.length; h++) {

            let keys = hierarchyTracks[h].keys

            for (let a = 0; a < keys.length; a++) {

                let offset = (a + h * keys.length) * 16

                let x = keys[a].rot[0], y = keys[a].rot[1], z = keys[a].rot[2], w = keys[a].rot[3];
                let x2 = x + x, y2 = y + y, z2 = z + z;
                let xx = x * x2, xy = x * y2, xz = x * z2;
                let yy = y * y2, yz = y * z2, zz = z * z2;
                let wx = w * x2, wy = w * y2, wz = w * z2;

                motionMatrices[offset + 0] = 1 - (yy + zz);
                motionMatrices[offset + 4] = xy - wz;
                motionMatrices[offset + 8] = xz + wy;

                motionMatrices[offset + 1] = xy + wz;
                motionMatrices[offset + 5] = 1 - (xx + zz);
                motionMatrices[offset + 9] = yz - wx;

                motionMatrices[offset + 2] = xz - wy;
                motionMatrices[offset + 6] = yz + wx;
                motionMatrices[offset + 10] = 1 - (xx + yy);

                // bottom row
                motionMatrices[offset + 12] = keys[a].pos ? keys[a].pos[0] : 0;
                motionMatrices[offset + 13] = keys[a].pos ? keys[a].pos[1] : 0;
                motionMatrices[offset + 14] = keys[a].pos ? keys[a].pos[2] : 0;
                motionMatrices[offset + 15] = 1;

                if (hierarchyTracks[h].parent !== -1) {

                    let parentOffset = (a + hierarchyTracks[h].parent * keys.length) * 16

                    let a11 = motionMatrices[parentOffset + 0]
                    let a12 = motionMatrices[parentOffset + 4]
                    let a13 = motionMatrices[parentOffset + 8]
                    let a14 = motionMatrices[parentOffset + 12]
                    let a21 = motionMatrices[parentOffset + 1]
                    let a22 = motionMatrices[parentOffset + 5]
                    let a23 = motionMatrices[parentOffset + 9]
                    let a24 = motionMatrices[parentOffset + 13]
                    let a31 = motionMatrices[parentOffset + 2]
                    let a32 = motionMatrices[parentOffset + 6]
                    let a33 = motionMatrices[parentOffset + 10]
                    let a34 = motionMatrices[parentOffset + 14]

                    let b11 = motionMatrices[offset + 0]
                    let b12 = motionMatrices[offset + 4]
                    let b13 = motionMatrices[offset + 8]
                    let b14 = motionMatrices[offset + 12]
                    let b21 = motionMatrices[offset + 1]
                    let b22 = motionMatrices[offset + 5]
                    let b23 = motionMatrices[offset + 9]
                    let b24 = motionMatrices[offset + 13]
                    let b31 = motionMatrices[offset + 2]
                    let b32 = motionMatrices[offset + 6]
                    let b33 = motionMatrices[offset + 10]
                    let b34 = motionMatrices[offset + 14]
                    let b41 = motionMatrices[offset + 3]
                    let b42 = motionMatrices[offset + 7]
                    let b43 = motionMatrices[offset + 11]
                    let b44 = motionMatrices[offset + 15]

                    motionMatrices[offset + 0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
                    motionMatrices[offset + 4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
                    motionMatrices[offset + 8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
                    motionMatrices[offset + 12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

                    motionMatrices[offset + 1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
                    motionMatrices[offset + 5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
                    motionMatrices[offset + 9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
                    motionMatrices[offset + 13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

                    motionMatrices[offset + 2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
                    motionMatrices[offset + 6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
                    motionMatrices[offset + 10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
                    motionMatrices[offset + 14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

                }

            }

        }

        let motionTexture1 = new DataTexture(
            motionMatrices,
            size,
            size,
            RGBAFormat,
            FloatType
        )

        let motionTexture2 = new DataTexture(
            motionMatrices,
            size,
            size,
            RGBAFormat,
            FloatType
        )


        let gpuComputeSize = hierarchyTracks[0].keys.length
        this.gpuComputeSize = _Math.ceilPowerOfTwo(gpuComputeSize)

        this.gpuCompute = new GPUComputationRenderer(gpuComputeSize, gpuComputeSize, new WebGLRenderer())
        let errorTexture = this.gpuCompute.createTexture()
        let errorVariable = this.gpuCompute.addVariable("textureMotion1", calc_pose_error, errorTexture)

        errorVariable.material.uniforms.vertexTexture = vertexTexture
        errorVariable.material.uniforms.skinIndicesTexture = skinIndicesTexture
        errorVariable.material.uniforms.skinWeightsTexture = skinWeightsTexture
        errorVariable.material.uniforms.skinIndicesTextureSize = skinIndicesTextureSize

        errorVariable.material.uniforms.motionTexture1 = motionTexture1
        errorVariable.material.uniforms.motionTexture2 = motionTexture2

        if (this.gpuCompute.init() !== null) {
            console.error(error)
        }

        this.gpuCompute.compute()

    }

    generateClipFromPath(path) {

    }

    // See (1) equation
    computeFrameDistance() {

        let p0 = []
        let p1 = []

        let theta

    }

}