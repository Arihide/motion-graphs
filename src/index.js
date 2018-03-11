import { WebGLRenderer, PerspectiveCamera } from 'three'

import { OrbitControls } from './OrbitControls'

import MotionScene from './MotionScene'
import MotionRenderer from './MotionRenderer'

const camera = new PerspectiveCamera(40, MotionRenderer.domElement.width / MotionRenderer.domElement.height, 1, 100000)
camera.position.set(0, 800, 2000)
camera.lookAt(MotionScene.position)
const controls = new OrbitControls(camera)

function animate() {
    window.requestAnimationFrame(animate)

    controls.update()
    MotionScene.compute()

    MotionRenderer.render(MotionScene, camera)

}

window.addEventListener('resize', function(){
    MotionRenderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = MotionRenderer.domElement.width / MotionRenderer.domElement.height
    camera.updateProjectionMatrix()
})

animate();