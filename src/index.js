import { WebGLRenderer, PerspectiveCamera } from 'three'

import MotionScene from './MotionScene'
import MotionRenderer from './MotionRenderer'

const camera = new PerspectiveCamera(40, MotionRenderer.domElement.width / MotionRenderer.domElement.height, 1, 10000)
camera.position.set(0, 100, 1000)
camera.lookAt(MotionScene.position)

function animate() {
    window.requestAnimationFrame(animate)

    MotionScene.compute()

    MotionRenderer.render(MotionScene, camera)

}

animate();