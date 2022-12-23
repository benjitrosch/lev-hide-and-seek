import Renderer from "./Renderer"

/**
 * gore game loop to call update and draw methods
 * on a fixed 60fps timstep
 */
export abstract class Game {
    protected gfx: Renderer

    private static readonly TIMESTEP = 1000 / 60
    private previousTime = 0
    private accumulatedTime = 0

    constructor(ctx: CanvasRenderingContext2D) {
        this.gfx = new Renderer(ctx)
    }
    
    /** call to begin the game loop */
    public run(currentTime: number = performance.now()) {
        this.accumulatedTime += (currentTime - this.previousTime)
        this.previousTime = currentTime
        
        while (this.accumulatedTime >= Game.TIMESTEP) {
            this.update(Game.TIMESTEP * .001)
            this.accumulatedTime -= Game.TIMESTEP
        }
        
        this.draw(this.gfx)
        requestAnimationFrame(this.run.bind(this, performance.now()))
    }
    
    /** initialize game */
    public abstract start()

    /**
     * updates game logic once per frame
     * @param dt delta time
     */
     protected abstract update(dt: number)
    /**
     * renders current game state
     * @param gfx canvas rendering context
     */
     protected abstract draw(gfx: Renderer)
}

export enum GameState {
    PREGAME = "pregame",
    LOADING = "loading",
    PLAYING = "playing",
    RESULTS = "results",
}

export class GameManager {
    private static _instance: GameManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public get started() {
        return this.state === GameState.PLAYING
    }

    public state: GameState = GameState.PREGAME
    public winner: "hide" | "seek" | null = null
    public timeLeft: number = 0

    public transitionAlpha: number = 0

    public fullscreen: boolean = false
    public debug: boolean = false

    // ref to canvas for fullscreen
    private canvas: HTMLCanvasElement

    public init(canvas: HTMLCanvasElement) {
        this.canvas = canvas

        document.addEventListener('keydown', function(e) {
            switch (e.key) {
                // toggle fullscreen
                case 'f':
                    GameManager.instance.toggleFullscreen()
                    break

                // activate debug mode
                case '`':
                    GameManager.instance.debug = !GameManager.instance.debug
                    break
            }
        })
    }

    public toggleFullscreen() {
        this.fullscreen = !this.fullscreen

        if (this.fullscreen) this.canvas.requestFullscreen()
        else document.exitFullscreen()
    }
}  
