import Camera from "./Camera"

export default class MouseManager {
    private static _instance: MouseManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    // ref to canvas for measuring
    // mouse position against bounding rect
    private canvas: HTMLCanvasElement

    public x: number = 0
    public y: number = 0

    public get worldX() {
        return this.x + Camera.instance.xView
    }

    public get worldY() {
        return this.y + Camera.instance.yView
    }
    
    public init(canvas: HTMLCanvasElement) {
        this.canvas = canvas

        document.addEventListener('mousemove', (e) => { this.mouseMove(e) })
        document.addEventListener('mousedown', (e) => { this.mouseDown(e) })
        document.addEventListener('mouseup', (e) => { this.mouseUp(e) })
    }

    private mouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect()

        this.x = (e.clientX - rect.left) / (rect.right - rect.left) * this.canvas.width
        this.y =( e.clientY - rect.top) / (rect.bottom - rect.top) * this.canvas.height
    }

    private mouseDown(e: MouseEvent) {

    }

    private mouseUp(e: MouseEvent) {

    }
}