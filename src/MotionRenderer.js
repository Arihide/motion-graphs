
import { WebGLRenderer } from 'three'

const canvas = document.getElementById("3d")
const renderer = new WebGLRenderer({ antialias: true, canvas: canvas })
renderer.setSize(canvas.clientWidth, canvas.clientHeight)

export default renderer