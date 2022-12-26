import Camera from "./Camera"
import { GameManager } from "./Game"

export default class MouseManager {
    private static _instance: MouseManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public x: number = 0
    public y: number = 0

    public down: boolean = false

    public get worldX() {
        return this.x + Camera.instance.xView
    }

    public get worldY() {
        return this.y + Camera.instance.yView
    }
    
    public init() {
        document.addEventListener('mousemove', (e) => { this.mouseMove(e) })
        document.addEventListener('mousedown', (e) => { this.mouseDown(e) })
        document.addEventListener('mouseup', (e) => { this.mouseUp(e) })
        document.addEventListener('touchmove', (e) => { this.touchDown(e) })
        document.addEventListener('touchstart', (e) => { this.touchDown(e) })
        document.addEventListener('touchend', (e) => { this.touchUp(e) })
    }

    private mouseMove(e: MouseEvent) {
        const { x, y } = GameManager.instance.screenToWorld(e.clientX, e.clientY)
        this.x = x
        this.y = y
    }

    private mouseDown(e: MouseEvent) {
        this.down = true
    }

    private mouseUp(e: MouseEvent) {
        this.down = false
    }

    private touchDown(e: TouchEvent) {
        this.down = true

        if (e.touches.length) {
            const { clientX, clientY } = e.touches[e.touches.length - 1]
            const { x, y } = GameManager.instance.screenToWorld(clientX, clientY)
            this.x = x
            this.y = y
        }
    }

    private touchUp(e: TouchEvent) {
        this.down = false
        
        this.x = 0
        this.y = 0
    }
}