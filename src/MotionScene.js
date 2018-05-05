import {
    Scene, BufferGeometry, PlaneBufferGeometry, DirectionalLight, MeshBasicMaterial,
    MeshLambertMaterial, SpriteMaterial, Mesh, Sprite, SkinnedMesh, AnimationClip,
    AnimationMixer, TextureLoader, JSONLoader, FileLoader, RepeatWrapping, Skeleton, SkeletonHelper,
    SplineCurve, CatmullRomCurve3, Vector3, Vector2
} from 'three'
import MotionGraph from './MotionGraph'

import { LineGeometry } from './lines/LineGeometry'
import { LineMaterial } from './lines/LineMaterial'
import { Line2 } from './lines/Line2'

import FloorTextureUrl from 'assets/checkerboard.jpg'

import AnimationAction from './AnimationAction'

import skeletonUrl from 'assets/skeleton.json'
import animationsUrl from 'assets/animations.json'

import dat from 'dat.gui'

const motionScene = new Scene()

const floorGeo = new PlaneBufferGeometry(1000, 1000)
const floorTex = new TextureLoader().load(FloorTextureUrl)
floorTex.wrapS = floorTex.wrapT = RepeatWrapping
floorTex.repeat.set(8, 8)
const floorMat = new MeshBasicMaterial({ map: floorTex, color: 0xffffff })
const floor = new Mesh(floorGeo, floorMat)
floor.position.set(0, 0, -100)
floor.rotation.set(-Math.PI / 2, 0, 0)
motionScene.add(floor)

const light = new DirectionalLight(0xffffff)
light.position.set(-50, 200, 50)
light.lookAt(0, 0, 0)
motionScene.add(light)

const light2 = new DirectionalLight(0xffffff)
light2.position.set(50, 100, 50)
light2.lookAt(0, 0, 0)
motionScene.add(light2)

new JSONLoader().load(skeletonUrl, (data) => {
    let mesh = new SkinnedMesh(data, new MeshLambertMaterial({ color: 0xaaaaff, skinning: true }))
    motionScene.add(mesh)

    let helper = new SkeletonHelper(mesh)
    motionScene.add(helper)

    let paths = [
        new SplineCurve([
            new Vector2(0, 0),
            new Vector2(-60, 100),
            new Vector2(0, 200),
            new Vector2(100, 200),
            new Vector2(100, 0),
            new Vector2(0, 0),
        ]),
        new SplineCurve([
            new Vector2(0, 0),
            new Vector2(80, -80),
            new Vector2(-80, -200),
            new Vector2(40, -260),
        ])
    ]
    
    let desirePath = paths[0]
    drawDesireCurve(desirePath)

    new FileLoader().load(animationsUrl, (data) => {

        let anim = JSON.parse(data)

        let clips = []
        for (let a of anim) {
            clips.push(AnimationClip.parseAnimation(a, mesh.skeleton.bones))
        }

        let myaction = new AnimationAction(mesh, clips)
        let moGraph = new MotionGraph(mesh, myaction)

        {
            let ul = document.getElementById("clip-list")
            for (let clip of clips) {
                let elem = document.createElement('li')
                elem.innerHTML = `${clip.name}:`
                let button = document.createElement("button")
                button.innerHTML = "play"
                button.onclick = function () {
                    let graphWalk = {
                        initialPos: new Vector2(),
                        initialDir: desirePath.getTangent(0),
                        nodes: [
                            { sourceFrame: 0, targetFrame: 100, clip: clip },
                        ]
                    }

                    myaction.setGraphWalk(graphWalk)

                    let trajectory = myaction.getGraphWalkTrajectory()
                    let curve = new SplineCurve(trajectory)
                    myaction.play()

                    drawMotionCurve(trajectory)

                    motionScene.compute = function () {

                        myaction.update(0.01)

                    }
                }
                elem.appendChild(button)
                ul.appendChild(elem)
            }
        }

        document.getElementById("mograph-construction").onclick = function () {
            moGraph.constructMotionGraph()
        }

        for (let i=0;i<paths.length;i++) {

            let path = paths[i]

            let ul = document.getElementById("path-list")
            let elem = document.createElement('li')
            elem.innerHTML = `path${i}:`
            let button = document.createElement("button")
            button.onclick = function () {
                desirePath = path
                drawDesireCurve(path)
            }
            button.innerHTML = 'select'
            elem.appendChild(button)
            ul.appendChild(elem)

        }

        document.getElementById('synthesize-path').onclick = function () {
            let trajectory = moGraph.searchPath(desirePath)
            let curve = new SplineCurve(trajectory)

            drawMotionCurve(trajectory)

            myaction.play()

            motionScene.compute = function () {

                myaction.update(0.01)

            }
        }

        document.getElementById('replay').onclick = function () {
            myaction.play()
        }

    })

    const drawMotionCurve = (function () {

        return function (trajectory) {

            let o = motionScene.getObjectByName("path")
            motionScene.remove(o)

            let pathGeo = new LineGeometry()
            let pathMat = new LineMaterial({ color: 0x999999, linewidth: 0.005 })
            let pathObj = new Line2(pathGeo, pathMat)
            pathObj.name = "path"
            motionScene.add(pathObj)

            let points = []
            for (let i = 0; i < trajectory.length; i += 3) {
                points.push(trajectory[i].x)
                points.push(1)
                points.push(trajectory[i].y)
            }

            pathGeo.setPositions(points)
            pathObj.computeLineDistances()

        }

    })()

    function drawDesireCurve(curve) {

        motionScene.remove(motionScene.getObjectByName("desire"))

        let positions = []

        for (let i = 0, l = 50; i < l; i++) {
            let point = curve.getPoint(i / l);
            positions.push(point.x, 1, point.y);
        }

        let desirePathGeo = new LineGeometry()
        desirePathGeo.setPositions(positions)
        let desirePathMat = new LineMaterial({ color: 0xFFD700, linewidth: 0.008 })
        let desirePathObj = new Line2(desirePathGeo, desirePathMat)
        desirePathObj.computeLineDistances()
        desirePathObj.name = "desire"
        motionScene.add(desirePathObj)

    }

})

// function showGraphTexture() {

//     let canvas = document.getElementById("texture")
//     let ctx = canvas.getContext('2d')

//     let texture = moGraph.texture
//     // texture.image.data = texture.image.data.map((x, i) => {
//     //     return x / 30000000
//     // })
//     // texture.needsUpdate = true

//     console.log(texture)

//     ctx.drawImage(texture.image, 100, 100)

//     // let spriteMaterial = new SpriteMaterial({ map: texture, color: 0xffffff })
//     // let sprite = new Sprite(spriteMaterial)
//     // // sprite.scale.set(500, 500, 500)
//     // sprite.position.set(0, 0, 100)
//     // motionScene.add(sprite)
// }

// function playRandomWalk() {
//     let graphWalk = {
//         initialPos: new Vector2(),
//         initialDir: desirePath.getTangent(0),
//         nodes: moGraph.sampleRandomWalk()
//     }

//     myaction.setGraphWalk(graphWalk)

//     let trajectory = myaction.getGraphWalkTrajectory()
//     let curve = new SplineCurve(trajectory)

//     console.log(trajectory)

//     myaction.play()

//     drawMotionCurve(trajectory)

//     motionScene.compute = function () {

//         myaction.update(0.01)

//     }
// }

motionScene.compute = function () {

}

export default motionScene;