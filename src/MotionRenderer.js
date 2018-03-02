
import { WebGLRenderer } from 'three'

const canvas = document.getElementsByTagName("canvas")[0]
const renderer = new WebGLRenderer({ antialias: true, canvas: canvas })
renderer.setSize(canvas.clientWidth, canvas.clientHeight)

export default renderer