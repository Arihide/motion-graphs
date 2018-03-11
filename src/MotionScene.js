import { Scene, BufferGeometry, PlaneBufferGeometry, DirectionalLight, MeshBasicMaterial, MeshLambertMaterial, SpriteMaterial, Mesh, Sprite, SkinnedMesh, AnimationClip, AnimationMixer, TextureLoader, JSONLoader, FileLoader, RepeatWrapping, Skeleton, SkeletonHelper } from 'three'
import MotionGraph from './MotionGraph'

import FloorTextureUrl from 'assets/checkerboard.jpg'

import AnimationAction from './AnimationAction'

const motionScene = new Scene()

const floorGeo = new PlaneBufferGeometry(1000, 1000)
const floorTex = new TextureLoader().load(FloorTextureUrl)
floorTex.wrapS = floorTex.wrapT = RepeatWrapping
floorTex.repeat.set(8, 8)
const floorMat = new MeshBasicMaterial({ map: floorTex, color: 0xffffff })
const floor = new Mesh(floorGeo, floorMat)
floor.position.set(0, 0, -100)
floor.rotation.set(-Math.PI / 2, 0, 0)
floor.scale.set(10, 10, 1)
motionScene.add(floor)

const light = new DirectionalLight(0xffffff)
light.position.set(-50, 200, 50)
light.lookAt(0, 0, 0)
motionScene.add(light)

const light2 = new DirectionalLight(0xffffff)
light2.position.set(50, 100, 50)
light2.lookAt(0, 0, 0)
motionScene.add(light2)


import skeletonUrl from 'assets/skeleton.json'
import animationUrl from 'assets/animation.json'

new JSONLoader().load(skeletonUrl, (data) => {
    let mesh = new SkinnedMesh(data, new MeshLambertMaterial({ color: 0xaaaaaa, skinning: true }))
    motionScene.add(mesh)
    mesh.scale.set(5, 5, 5)

    let helper = new SkeletonHelper(mesh)
    helper.material.linewidth = 10
    motionScene.add(helper)

    new FileLoader().load(animationUrl, (data) => {

        let moGraph = new MotionGraph(mesh)

        let anim = JSON.parse(data)
        let clip = AnimationClip.parseAnimation(anim[1], mesh.skeleton.bones)
        // let texture = moGraph.constructMotionGraph(anim[1])
        // texture.image.data = texture.image.data.map((x, i) => {
        //     return x / 3000
        // })
        // texture.needsUpdate = true

        // let spriteMaterial = new SpriteMaterial({ map: texture, color: 0xffffff })
        // let sprite = new Sprite(spriteMaterial)
        // sprite.scale.set(500, 500, 500)
        // sprite.position.set(0, 0, 1000)
        // motionScene.add(sprite)

        let myaction = new AnimationAction(mesh)
        myaction.clipAction(clip)

        myaction.transit(clip, 406, 0.0000333, 76)


        motionScene.compute = function () {

            myaction.update(0.01)

        }

    })

})

motionScene.compute = function () {

}

export default motionScene;