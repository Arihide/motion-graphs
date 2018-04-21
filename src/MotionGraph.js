import {
    Math as _Math, WebGLRenderer, Vector2, Vector3, Quaternion, Matrix4,
    DataTexture, FileLoader, RGBFormat, RGBAFormat, FloatType,
    BufferGeometry, AnimationClip, SplineCurve
} from 'three'
import { GPUComputationRenderer } from './GPUComputationRenderer'

import calc_pose_error from './calc_pose_error.glsl'

import MotionRenderer from './MotionRenderer'

export default class MotionGraph {

    constructor(character, player) {
        this.character = character
        this.player = player

        // 点群の重み
        // this.weights = []

        this.texture

        this.edges = {}
        this.boundary = {}

        this.transitionThreshold = 400

        this.errorTolerance = 5

    }

    constructMotionGraph(animation, bones) {

        console.log("start motion graph construction")

        let bufferGeometry = new BufferGeometry().fromGeometry(this.character.geometry)

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

        let errorTextureSize = hierarchyTracks[0].keys.length

        let clip = this.clip = AnimationClip.parseAnimation(animation, bones)

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

                        if (i === j) continue

                        cnt++

                        let edge = {
                            sourceFrame: i,
                            targetFrame: j
                        }

                        if (this.edges[clip.uuid] === undefined)
                            this.edges[clip.uuid] = []

                        this.edges[clip.uuid].push(edge)

                    }
                }
            }
        }

        this._strongConnect(clip)

        console.log(this.edges)
        console.log(`complete construction!`)

        this.texture = new DataTexture(localMinimas, hierarchyTracks[0].keys.length, hierarchyTracks[0].keys.length, RGBAFormat, FloatType)

    }

    _strongConnect(clip) {

        let stack = []
        let lowlink = this.boundary.min = Infinity
        let upperBoundary = this.boundary.max = this.edges[clip.uuid][this.edges[clip.uuid].length - 1].sourceFrame

        for (let i = this.edges[clip.uuid].length; i--;) {

            let edge = this.edges[clip.uuid][i]

            if (edge.sourceFrame > edge.targetFrame) {

                lowlink = Math.min(edge.targetFrame, lowlink)
                upperBoundary = Math.max(upperBoundary, edge.sourceFrame)

            }

            if (edge.sourceFrame === lowlink) {

                if (upperBoundary - lowlink > this.boundary.max - this.boundary.min) {
                    this.boundary.max = upperBoundary
                    this.boundary.min = lowlink
                }


                upperBoundary = 0

            }

        }

        this.boundary.min = Math.max(Math.ceil(this.player.transitionDuration * 120), this.boundary.min)

        this.edges[clip.uuid] = this.edges[clip.uuid].filter((edge) => {

            return (
                edge.sourceFrame >= this.boundary.min && edge.sourceFrame <= this.boundary.max &&
                edge.targetFrame >= this.boundary.min && edge.targetFrame <= this.boundary.max
            )
        })


    }

    sampleRandomWalk() {

        let graphWalkSize = 1
        let nodes = []

        nodes.push({ sourceFrame: this.boundary.min })
        for (let i = 0; i < graphWalkSize; i++) {

            let edges = this.edges[this.clip.uuid].filter((edge) => {
                return edge.sourceFrame >= nodes[i].sourceFrame
            })

            let edge = edges[Math.floor(Math.random() * edges.length)]

            nodes[i].targetFrame = edge.sourceFrame
            nodes.push({ sourceFrame: edge.targetFrame })
        }

        nodes[graphWalkSize].targetFrame = this.boundary.max

        console.log(nodes)

        return nodes

    }

    _search(nodes, clipTransform, frame, length, totalError, transited = false) {

        // console.log(`search called ${frame} ${length}`)

        if (this.desirePath.getLength() <= length + 2) {
            nodes[nodes.length - 1].targetFrame = frame
            return nodes
        }

        let nextFrame = this.edges[this.clip.uuid].find((edge) => {
            return edge.sourceFrame > frame
        })

        let points, lengths, error, nextLength, gw

        if (nextFrame) {

            nextFrame = nextFrame.sourceFrame

            points = this.player.getTrajectory(frame, nextFrame, clipTransform)
            lengths = [length]
            for (let p = 1; p < points.length; p++) {
                lengths.push(lengths[p - 1] + points[p].distanceTo(points[p - 1]))
            }

            nextLength = lengths[lengths.length - 1]

            error = lengths.map((i) => {
                return i / this.desirePath.getLength()
            }).filter((i) => {
                return i <= 1
            }).map((curr, idx) => {
                return this.desirePath.getPointAt(curr).distanceTo(points[idx])
            }, 0)

            if (Math.max.apply(this, error) < this.errorTolerance) {
                gw = this._search(nodes, clipTransform, nextFrame, nextLength, totalError + error)

                if (gw) {
                    return gw
                }
            }

        }

        if (transited) return null

        nodes[nodes.length - 1].targetFrame = frame
        let edges = this.edges[this.clip.uuid].filter((edge) => {
            return edge.sourceFrame === frame
        })

        let errors = []
        let nextClipTransforms = []
        let nextLengths = []

        for (let edge of edges) {

            nextFrame = edge.targetFrame

            let nextClipTransform = this.player.getClipTransform(frame, nextFrame, clipTransform)
            points = this.player.getTransitingTrajectory(frame, nextFrame, clipTransform, nextClipTransform)
            lengths = [length]
            for (let p = 1; p < points.length; p++) {
                lengths.push(lengths[p - 1] + points[p].distanceTo(points[p - 1]))
            }
            nextLength = lengths[lengths.length - 1]

            error = lengths.map((i) => {
                return i / this.desirePath.getLength()
            }).filter((i) => {
                return i <= 1
            }).map((curr, idx) => {
                return this.desirePath.getPointAt(curr).distanceTo(points[idx])
            }, 0)

            nextClipTransforms[edge] = nextClipTransform
            nextLengths[edge] = nextLength
            errors[edge] = Math.max.apply(this, error)

        }

        edges.sort((a, b) => {

            return errors[a] - errors[b]

        })

        for (let edge of edges) {

            let nextNodes = [...nodes, {
                sourceFrame: nextFrame
            }]

            if (errors[edge] < this.errorTolerance) {

                gw = this._search(nextNodes, nextClipTransforms[edge], edge.targetFrame, nextLengths[edge], totalError + errors[edge], true)

                if (gw) {
                    return gw
                }
            }

        }

        return null

    }

    searchPath(desirePath) {

        this.desirePath = desirePath

        let nodes
        let initialClipTransform

        console.log(this.desirePath.getLength())

        for (let edge of this.edges[this.clip.uuid]) {

            let initialFrame = edge.sourceFrame

            initialClipTransform = this.player.getClipTransformFromPosDir(desirePath.getPoint(0), desirePath.getTangent(0), initialFrame)

            nodes = this._search([{ sourceFrame: initialFrame }], initialClipTransform, initialFrame, 0, 0)

            if (nodes) break

        }

        if (!nodes) {
            throw new Error("There is no graph walk satisfied")
        }

        let graphWalk = {
            initialPos: desirePath.getPoint(0),
            initialDir: desirePath.getTangent(0),
            nodes: nodes
        }

        console.log(graphWalk)

        this.player.setGraphWalk(graphWalk)

        return this.player.getGraphWalkTrajectory()

    }

}