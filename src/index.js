import { WebGLRenderer, PerspectiveCamera } from 'three'

import MotionScene from './MotionScene'

const canvas = document.getElementsByTagName("canvas")[0]
const renderer = new WebGLRenderer({ antialias: true, canvas: canvas })
renderer.setSize(canvas.clientWidth, canvas.clientHeight)
const camera = new PerspectiveCamera(40, canvas.width / canvas.height, 1, 10000)
camera.position.set(0, 100, 1000)
camera.lookAt(MotionScene.position)

function animate() {
    window.requestAnimationFrame(animate)

    renderer.render(MotionScene, camera)

}

animate();