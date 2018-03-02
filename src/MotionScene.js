import { Scene, BufferGeometry, PlaneBufferGeometry, MeshBasicMaterial, MeshLambertMaterial, SpriteMaterial, Mesh, Sprite, SkinnedMesh, AnimationClip, AnimationMixer, JSONLoader, FileLoader, Skeleton, SkeletonHelper } from 'three'
import MotionGraph from './MotionGraph'


const motionScene = new Scene()

const floorGeo = new PlaneBufferGeometry(1000, 1000)
const floorMat = new MeshBasicMaterial({ color: 0xffffff })
const floor = new Mesh(floorGeo, floorMat)
floor.position.set(0, -100, -100)
floor.rotation.set(-Math.PI / 2, 0, 0)

// motionScene.add(floor)

import skeletonUrl from 'assets/skeleton.json'
import animationUrl from 'assets/animation.json'

new JSONLoader().load(skeletonUrl, (data) => {
    let mesh = new SkinnedMesh(data, new MeshBasicMaterial({ color: 0xaaaaaa, skinning: true }))
    motionScene.add(mesh)
    mesh.scale.set(5, 5, 5)

    // mesh.skeleton.bones[1].rotation.x = Math.PI / 2

    let helper = new SkeletonHelper(mesh)
    helper.material.linewidth = 10
    motionScene.add(helper)

    new FileLoader().load(animationUrl, (data) => {

        let moGraph = new MotionGraph(mesh)

        let anim = JSON.parse(data)
        // anim = AnimationClip.parseAnimation(anim[0], mesh.skeleton.bones)
        let texture = moGraph.constructMotionGraph(anim[0])
        // texture.needsUpdate = true

        let spriteMaterial = new SpriteMaterial({ color: 0xffffff })
        let sprite = new Sprite(spriteMaterial)
        sprite.scale.set(100, 100, 100)
        // sprite.position.set(0, 100, 10)
        motionScene.add(sprite)
        // let mixer = new AnimationMixer(mesh)
        // let action = mixer.clipAction(anim)
        // action.play()

        motionScene.compute = function () {
            moGraph.gpuCompute.compute()

            spriteMaterial.map = moGraph.gpuCompute.getCurrentRenderTarget(moGraph.errorVariable).texture
            spriteMaterial.needsUpdate = true
        }


    })

})

motionScene.compute = function () {
            
}

export default motionScene;