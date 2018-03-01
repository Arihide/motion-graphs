import { Scene, BufferGeometry,PlaneBufferGeometry, MeshBasicMaterial, Mesh, SkinnedMesh, AnimationClip, AnimationMixer, JSONLoader, FileLoader, Skeleton, SkeletonHelper } from 'three'
import MotionGraph from './MotionGraph'


const motionScene = new Scene()

const floorGeo = new PlaneBufferGeometry(1000, 1000)
const floorMat = new MeshBasicMaterial({ color: 0xffffff })
const floor = new Mesh(floorGeo, floorMat)
floor.position.set(0, -100, -100)
floor.rotation.set(-Math.PI / 2, 0, 0)

motionScene.add(floor)

import skeletonUrl from 'assets/skeleton.json'
import animationUrl from 'assets/animation.json'

new JSONLoader().load(skeletonUrl, (data, mat) => {
    let mesh = new SkinnedMesh(data, mat)
    motionScene.add(mesh)
    mesh.scale.set(5, 5, 5)

    let helper = new SkeletonHelper(mesh)
    helper.material.linewidth = 10
    motionScene.add(helper)

    console.log(mesh)

    new FileLoader().load(animationUrl, (data) => {

        let moGraph = new MotionGraph()

        let anim = JSON.parse(data)
        // anim = AnimationClip.parseAnimation(anim[0], mesh.skeleton.bones)
        moGraph.constructMotionGraph(anim[0])
        // console.log(anim)

        // let mixer = new AnimationMixer(mesh)
        // let action = mixer.clipAction(anim)
        // action.play()

    })

})

export default motionScene;