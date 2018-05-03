import {
    Math as _Math, WebGLRenderer, Vector2, Vector3, Quaternion, Matrix4,
    DataTexture, FileLoader, RGBFormat, RGBAFormat, FloatType,
    BufferGeometry, SplineCurve
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
        this.transitionEdges = {}
        this.originalEdges = {}

        this.boundaries = {}
        this.frameLengths = {}

        // Mean distance between vertices
        this.transitionThreshold = 1.2

        this.errorTolerance = 150

    }

    constructMotionGraph() {

        console.log("start motion graph construction")

        console.log(this.player)

        let clips = this.player.clips
        let mesh = this.player._root;
        let bufferGeometry = new BufferGeometry().fromGeometry(mesh.geometry)

        let bones = mesh.skeleton.bones



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

        let boneSize = bones.length

        let motionTextures = []
        for (let clip of clips) { //creating motion texture

            let keySize = clip.tracks[0].times.length

            let motionTextureSize = Math.sqrt(boneSize * keySize * 4); // 4 pixels needed for 1 matrix
            motionTextureSize = _Math.ceilPowerOfTwo(motionTextureSize)
            motionTextureSize = Math.max(motionTextureSize, 4)

            let motionMatrices = new Float32Array(motionTextureSize * motionTextureSize * 4) // 4 floats per RGBA pixel

            let interpolants = this.player._interpolants
            let bindings = this.player._bindings

            this.originalEdges[clip.uuid] = []
            this.transitionEdges[clip.uuid] = []

            for (let k = 0; k < keySize; k++) {

                let time = clip.tracks[0].times[k]

                for (let i = 0; i < bindings.length; i++) {

                    interpolants[clip.uuid][i].evaluate(time)
                    bindings[i].accumulate(0, 1)
                    bindings[i].apply(0)

                }

                for (let b = 0; b < boneSize; b++) {

                    bones[b].updateMatrix()
                    bones[b].updateMatrixWorld()
                    motionMatrices.set(bones[b].matrixWorld.elements, (b + k * boneSize) * 16)

                }

                this.transitionEdges[clip.uuid][k] = []

            }

            let motionTexture = new DataTexture(
                motionMatrices,
                motionTextureSize,
                motionTextureSize,
                RGBAFormat,
                FloatType
            )
            motionTexture.needsUpdate = true
            motionTextures.push(motionTexture)
        }

        let renderer = MotionRenderer

        for (let i = 0; i < clips.length; i++) { //compute pose distance and local minima

            let clip1 = clips[i]

            for (let j = 0; j < clips.length; j++) {

                let clip2 = clips[j]
                let motionTexture1 = motionTextures[i]
                let motionTexture2 = motionTextures[j]

                let keySize1 = clip1.tracks[0].times.length
                let keySize2 = clip2.tracks[0].times.length

                this.gpuCompute = new GPUComputationRenderer(keySize1, keySize2, renderer)

                this.errorVariable = this.gpuCompute.addVariable("textureMotion1", calc_pose_error)
                this.gpuCompute.setVariableDependencies(this.errorVariable, [this.errorVariable])

                this.errorVariable.material.uniforms.vertexTexture = { value: vertexTexture }
                this.errorVariable.material.uniforms.vertexTextureSize = { value: vertexTextureSize }
                this.errorVariable.material.defines.vertexLength = 512
                this.errorVariable.material.uniforms.skinIndicesTexture = { value: skinIndicesTexture }
                this.errorVariable.material.uniforms.skinWeightsTexture = { value: skinWeightsTexture }
                this.errorVariable.material.uniforms.skinIndicesTextureSize = { value: skinIndicesTextureSize }

                this.errorVariable.material.uniforms.motionTexture1 = { value: motionTexture1 }
                this.errorVariable.material.uniforms.motionTexture2 = { value: motionTexture2 }
                this.errorVariable.material.uniforms.motionTexture1Size = { value: motionTexture1.image.width }
                this.errorVariable.material.uniforms.motionTexture2Size = { value: motionTexture2.image.width }
                this.errorVariable.material.uniforms.boneSize = { value: boneSize }

                if (this.gpuCompute.init() !== null) {
                    console.error(error)
                }

                this.gpuCompute.compute()

                let buffer = new Float32Array(keySize1 * keySize2 * 4);
                renderer.readRenderTargetPixels(this.gpuCompute.getCurrentRenderTarget(this.errorVariable), 0, 0, keySize1, keySize2, buffer)

                let localMinimas = new Float32Array(keySize1 * keySize2 * 4)

                if (this.edges[clip1.uuid] === undefined) {
                    this.edges[clip1.uuid] = []
                }

                for (let k = 1; k < keySize1 - 1; k++) {
                    for (let l = 1; l < keySize2 - 1; l++) {
                        let pos = (k + keySize2 * l) * 4
                        if (
                            buffer[pos] < buffer[pos - 4] &&
                            buffer[pos] < buffer[pos + 4] &&
                            buffer[pos] < buffer[pos - keySize2 * 4] &&
                            buffer[pos] < buffer[pos + keySize2 * 4]
                        ) {
                            if (buffer[pos] <= this.transitionThreshold) {
                                localMinimas[pos] = 1
                                localMinimas[pos + 1] = 1
                                localMinimas[pos + 2] = 0
                                localMinimas[pos + 3] = 1

                                if (k === l) continue

                                let edge = {
                                    sourceFrame: k,
                                    targetFrame: l,
                                    targetClip: clip2
                                }

                                let node = {
                                    frame: l,
                                    clip: clip2
                                }

                                this.edges[clip1.uuid].push(edge)
                                this.transitionEdges[clip1.uuid][k].push(node)

                            }
                        }
                    }
                }

                this.texture = new DataTexture(localMinimas, keySize1, keySize2, RGBAFormat, FloatType)

            }

            this.edges[clip1.uuid].sort((a, b) => {
                return a.sourceFrame - b.sourceFrame
            })

        }

        for (let clip of clips) {

            let keySize = clip.tracks[0].times.length

            for (let k = 0; k < keySize; k++) {

                let frame = null

                for (let l = k + 1; l < keySize; l++) {

                    if (this.transitionEdges[clip.uuid][l].length) {

                        frame = l

                        break

                    }

                }


                this.originalEdges[clip.uuid][k] = frame

            }

            this.frameLengths[clip.uuid] = [0]
            let values = clip.tracks[0].values
            for (let k = 3, prev = 0; k < values.length; k += 3) {

                let l = Math.pow(values[k] - values[k - 3], 2) + Math.pow(values[k + 2] - values[k - 1], 2)
                l = Math.sqrt(l) + prev
                this.frameLengths[clip.uuid].push(l)
                prev = l
            }

        }

        this._strongConnect(clips)

        console.log(`complete construction!`)

        console.log(this.edges)
        console.log(this.originalEdges)
        console.log(this.transitionEdges)
        console.log(this.frameLengths)

    }

    _strongConnect(clips) {

        // tarjan's strongly connected components algorithm
        // https://gist.github.com/chadhutchins/1440602

        let index = 0

        let indecies = {}
        let lowlink = {}
        let lastFrame = {}
        let stacked = {}
        const edges = this.edges
        let boundaries = this.boundaries

        for (let clip of clips) {
            indecies[clip.uuid] = []
            lowlink[clip.uuid] = []
            lastFrame[clip.uuid] = clip.tracks[0].times.length
            stacked[clip.uuid] = []
            boundaries[clip.uuid] = { min: Infinity, max: 0 }
        }

        let stack = []
        let largest = []

        strongConnect({ clip: clips[0], frame: 0 })

        for (let node of largest) {

            boundaries[node.clip.uuid].min > node.frame && (boundaries[node.clip.uuid].min = node.frame)
            boundaries[node.clip.uuid].max < node.frame && (boundaries[node.clip.uuid].max = node.frame)

        }

        for (let uuid in boundaries) {

            boundaries[uuid].min = Math.max(boundaries[uuid].min, Math.ceil(120 * this.player.transitionDuration))

        }

        // prune edges
        for (let clip of clips) {

            let boundary = boundaries[clip.uuid]

            this.edges[clip.uuid] = this.edges[clip.uuid].filter((edge) => {
                return (
                    edge.sourceFrame >= boundary.min && edge.sourceFrame <= boundary.max &&
                    edge.targetFrame >= boundary.min && edge.targetFrame <= boundary.max
                )
            })

            for (let edges of this.transitionEdges[clip.uuid]) {

                edges = edges.filter((edge, frame) => {
                    return (
                        boundary.min <= frame && frame <= boundary.max &&
                        boundary.min <= edge.frame && edge.frame <= boundary.max
                    )
                })

            }

        }

        function strongConnect(node) {

            let clip = node.clip

            let last = lastFrame[clip.uuid]

            lastFrame[clip.uuid] = node.frame

            for (let i = node.frame; i < last; i++) {
                indecies[clip.uuid][i] = index
                lowlink[clip.uuid][i] = index
                index++
                stack.push({ clip: clip, frame: i })
                stacked[clip.uuid][i] = true
                // console.log(`${clip.name}:${i}`)
            }


            for (let i = last - 1; i >= node.frame; i--) {


                let edge = edges[clip.uuid].find(e => { return e.sourceFrame === i })

                if (edge !== undefined) {
                    // console.log(edge)
                    let targetClip = edge.targetClip
                    let targetFrame = edge.targetFrame
                    let targetLowlink = lowlink[targetClip.uuid][targetFrame]

                    if (targetLowlink === undefined) {

                        // console.log(targetLowlink)

                        strongConnect({ clip: targetClip, frame: targetFrame })
                        lowlink[clip.uuid][i] = Math.min(lowlink[targetClip.uuid][targetFrame], lowlink[clip.uuid][i])

                    } else if (stacked[clip.uuid][i]) {

                        lowlink[clip.uuid][i] = Math.min(indecies[targetClip.uuid][targetFrame], lowlink[clip.uuid][i])

                    }
                }


                if (!Number.isInteger(lowlink[clip.uuid][i + 1]))
                    lowlink[clip.uuid][i + 1] = Infinity

                lowlink[clip.uuid][i] = Math.min(lowlink[clip.uuid][i], lowlink[clip.uuid][i + 1])


                if (lowlink[clip.uuid][i] === indecies[clip.uuid][i]) {

                    let e = stack.pop()
                    let s = [e]
                    while (e.frame !== i || e.clip !== clip) {

                        e = stack.pop()
                        stacked[e.clip.uuid][e.frame] = false
                        s.push(e)

                    }

                    if (s.length > largest.length) {

                        largest = s

                    }

                }
            }

        }

    }

    toJSON() {

    }

    fromJSON(json) {

    }

    sampleRandomWalk() {

        let graphWalkSize = 5
        let nodes = []

        let clip = this.player.clips[0]
        nodes.push({ sourceFrame: this.boundaries[clip.uuid].min, clip: clip })
        for (let i = 0; i < graphWalkSize; i++) {

            // let boundary = this.boundaries[clip.uuid]

            // let nextFrame = Math.floor(Math.random() * (boundary.max - node.sourceFrame)) + node.sourceFrame
            // nextFrame = this.originalEdges[nextFrame]

            // let nextNode = this.transitionEdges[clip.uuid][nextFrame]


            let edges = this.edges[clip.uuid].filter((edge) => {
                return edge.sourceFrame >= nodes[i].sourceFrame
            })

            let edge = edges[Math.floor(Math.random() * edges.length)]

            nodes[i].targetFrame = edge.sourceFrame
            nodes.push({ sourceFrame: edge.targetFrame, clip: edge.targetClip })

            clip = edge.targetClip
        }

        nodes[graphWalkSize].targetFrame = this.boundaries[clip.uuid].max

        console.log(nodes)

        return nodes

    }



    searchPath(desirePath) {

        const player = this.player
        const edges = this.edges
        const originalEdges = this.originalEdges
        const transitionEdges = this.transitionEdges
        const errorTolerance = this.errorTolerance

        let nodes
        let bestGraph
        let minError = Infinity
        let pathLength = Math.min(30, desirePath.getLength())
        let searchLength = pathLength

        console.log(desirePath.getLength())

        for (let clip of this.player.clips) {

            let boundary = this.boundaries[clip.uuid]

            for (let frame = boundary.min; frame < boundary.max; frame += 15) {

                let initialClipTransform = this.player.getClipTransformFromPosDir(desirePath.getPoint(0), desirePath.getTangent(0), frame, clip)

                _search([{ clip: clip, sourceFrame: frame }], initialClipTransform, frame, 0, 0, true)

                // if (nodes && minError < this.errorTolerance) break

            }

        }

        nodes = bestGraph

        while (pathLength < desirePath.getLength()) {

            pathLength += 40
            pathLength = Math.min(pathLength, desirePath.getLength())
            searchLength = pathLength - searchLength

            let nodesLength = nodes.reduce((prev, node, idx) => {
                return node.targetFrame - node.sourceFrame + prev
                // and transition frame...
            }, 0)
            nodesLength = Math.ceil(nodesLength / 3)

            let nextNodes = []
            let clipTransform = this.player.getClipTransformFromPosDir(desirePath.getPoint(0), desirePath.getTangent(0), nodes[0].sourceFrame, nodes[0].clip)
            let nextFrame, nextLength = 0
            for (let node of nodes) {

                console.log({...node})

                nodesLength -= node.targetFrame - node.sourceFrame

                if (nodesLength > 0) {
                    if (nextNodes.length) {
                        let prevNode = nextNodes[nextNodes.length - 1]
                        clipTransform = this.player.getClipTransform(prevNode.targetFrame, node.sourceFrame, clipTransform, prevNode.clip, node.clip)
                    }
                    nextLength += this.frameLengths[node.clip.uuid][node.targetFrame] - this.frameLengths[node.clip.uuid][node.sourceFrame]
                    nextNodes.push(node)
                } else {
                    node.targetFrame += nodesLength
                    nextFrame = node.targetFrame
                    nextNodes.push(node)
                    nextLength += this.frameLengths[node.clip.uuid][node.targetFrame] - this.frameLengths[node.clip.uuid][node.sourceFrame]
                    break;
                }

            }

            console.log(nextNodes)
            console.log(nextLength)
            console.log(clipTransform)
            minError = Infinity
            _search(nextNodes, clipTransform, nextFrame, nextLength, 0, false)

            nodes = bestGraph

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

        // exceedingly slow...
        function _search(nodes, clipTransform, frame, length, totalError, transited = false) {

            console.log(`search called ${frame} ${length} ${totalError} ${transited} ${minError}`)

            let clip = nodes[nodes.length - 1].clip

            if (pathLength <= length + 2) {

                bestGraph = []
                for(let node of nodes){
                    bestGraph.push({...node})
                }
                bestGraph[nodes.length - 1].targetFrame = frame
                minError = totalError
                return true
            }


            let nextFrame = originalEdges[clip.uuid][frame]

            let points, lengths, error, nextLength

            if (nextFrame) {

                points = player.getTrajectory(frame, nextFrame, clipTransform, clip)
                lengths = [length]
                for (let p = 1; p < points.length; p++) {
                    lengths.push(lengths[p - 1] + points[p].distanceTo(points[p - 1]))
                }

                nextLength = lengths[lengths.length - 1]

                error = lengths.map((i) => {
                    return i / pathLength
                }).filter((i) => {
                    return i <= 1
                }).reduce((prev, curr, idx) => {
                    return prev + desirePath.getPointAt(curr).distanceTo(points[idx])
                }, 0)

                let nextTotalError = error + totalError

                // if (nextTotalError / nextLength < minError * 2 / searchLength) {

                    if (totalError + error < minError) {

                        _search(nodes, clipTransform, nextFrame, nextLength, nextTotalError)

                    }

                // }


            }

            if (transited) return false

            nodes[nodes.length - 1].targetFrame = frame

            let _edges = transitionEdges[clip.uuid][frame]

            let errors = []
            let nextClipTransforms = []
            let nextLengths = []

            for (let node of _edges) {

                nextFrame = node.frame

                let nextClipTransform = player.getClipTransform(frame, nextFrame, clipTransform, clip, node.clip)
                points = player.getTransitingTrajectory(frame, nextFrame, clipTransform, nextClipTransform, clip, node.clip)

                lengths = [length]
                for (let p = 1; p < points.length; p++) {
                    lengths.push(lengths[p - 1] + points[p].distanceTo(points[p - 1]))
                }
                nextLength = lengths[lengths.length - 1]

                if (points.length === 0) {

                    nextClipTransforms[node] = nextClipTransform
                    nextLengths[node] = nextLength
                    errors[node] = 0
                    continue
                }

                error = lengths.map((i) => {
                    return i / pathLength
                }).filter((i) => {
                    return i <= 1
                }).reduce((prev, curr, idx) => {
                    return prev + desirePath.getPointAt(curr).distanceTo(points[idx])
                }, 0)

                nextClipTransforms[node] = nextClipTransform
                nextLengths[node] = nextLength
                errors[node] = error

            }

            // _edges.sort((a, b) => {

            //     return errors[a] - errors[b]

            // })

            for (let node of _edges) {

                let nextNodes = [...nodes, {
                    clip: clip,
                    sourceFrame: nextFrame
                }]

                if (errors[node] + totalError < minError) {

                    _search(nextNodes, nextClipTransforms[node], node.frame, nextLengths[node], totalError + errors[node], true)
                }

            }

            return false

        }

    }

}