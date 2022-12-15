/// CONSTANTS ///
const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const WORLD_WIDTH = 7833
const WORLD_HEIGHT = 4524
/////////////////

/**
 * gore game loop to call update and draw methods
 * on a fixed 60fps timstep
 */
abstract class Game {
    private gfx: CanvasRenderingContext2D

    private static readonly TIMESTEP = 1000 / 60
    private previousTime = 0
    private accumulatedTime = 0

    constructor(gfx: CanvasRenderingContext2D) {
        this.gfx = gfx
    }

    /**
     * call to begin the game loop
     */
    public start() {
        this.run(performance.now())
    }

    public run(currentTime: number) {
        this.accumulatedTime += (currentTime - this.previousTime)
        this.previousTime = currentTime
        
        while (this.accumulatedTime >= Game.TIMESTEP) {
            this.update(Game.TIMESTEP * .001)
            this.accumulatedTime -= Game.TIMESTEP
        }
    
        this.draw(this.gfx)
        requestAnimationFrame(this.run.bind(this, performance.now()))
    }

    /**
     * updates game logic once per frame
     * @param dt delta time
     */
    abstract update(dt: number)
    /**
     * renders current game state
     * @param gfx canvas rendering context
     */
    abstract draw(gfx: CanvasRenderingContext2D)
}

/** base asset class to handle file loading */
abstract class Asset {
    protected filePath: string
    public fileName: string
  
    constructor(filePath: string) {
      this.filePath = `./assets/${filePath}`
  
      const directories = filePath.split('/')
      this.fileName = directories[directories.length - 1] ?? filePath
    }
}

/** image asset */
class Sprite extends Asset {
    public image: HTMLImageElement
    public loaded: boolean = false
  
    constructor(filePath: string) {
      super(filePath)
  
      const image = new Image()
      image.src = this.filePath
      image.onload = () => {
        this.loaded = true
      }
  
      this.image = image
    }
}   

class Background {
    private sprite: Sprite

    constructor() {
        this.sprite = new Sprite('map.jpeg')
    }

    public draw(gfx: CanvasRenderingContext2D, xView: number, yView: number) {
        let w = GAME_WIDTH
	    let h = GAME_HEIGHT

	    if (this.sprite.image.width - xView < w)
	      w = this.sprite.image.width - xView
	    if (this.sprite.image.height - yView < h)
	      h = this.sprite.image.height - yView

	    gfx.drawImage(this.sprite.image, xView, yView, w, h, 0, 0, w, h)
    }
}

/** basic 2d camera to define viewport bounds */
class Camera {
    public xView: number = 0
    public yView: number = 0

    constructor(xView, yView) {
        this.xView = xView
        this.yView = yView
    }

    // linear interpolate (ease) towards position
    private lerp(a: number, b: number, alpha: number) {
        return a + alpha * (b - a)
    }

    // center the camera viewport on a position
    public lookAt(x: number, y: number) {
        this.xView= this.lerp(this.xView, x - GAME_WIDTH / 2, 0.1)
        this.yView = this.lerp(this.yView, y - GAME_HEIGHT / 2, 0.1)

        this.clamp()
    }

    // restrict within game bounds (between origin and total area)
    private clamp() {
        this.xView = Math.min(this.xView, WORLD_WIDTH - GAME_WIDTH)
        this.xView = Math.max(this.xView, 0)

        this.yView = Math.min(this.yView, WORLD_HEIGHT - GAME_HEIGHT)
        this.yView = Math.max(this.yView, 0)
    }
}

abstract class Entity {
    public x: number
    public y: number
    public w: number
    public h: number

    protected sprite: Sprite

    constructor(sprite: string, x: number, y: number, w: number, h: number) {
        this.sprite = new Sprite(sprite)

        this.x = x
        this.y = y
        this.w = w
        this.h = h
    }

    public draw(gfx: CanvasRenderingContext2D, xView: number, yView: number) {
        gfx.drawImage(
            this.sprite.image,
            0,
            0,
            this.sprite.image.width,
            this.sprite.image.height,
            (this.x - this.w / 2) - xView,
            (this.y - this.h / 2) - yView,
            this.w,
            this.h
        )
    }
}

class Player extends Entity {
    private keys: Record<string, boolean>
    private speed: number = 512

    constructor(x: number, y: number) {
        super('idle.png', x, y, 96, 128)

        this.keys = {
            // movement arrows
            ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
            // movement wasd
            w: false, a: false, s: false, d: false,
            // interact
            ' ': false, e: false
        }
        document.onkeydown = (e) => this.keyDown(e)
        document.onkeyup = (e) => this.keyUp(e)
    }

    public update(dt: number) {
        const dir = { x: 0, y: 0 }
        dir.x = (-(this.keys.ArrowLeft || this.keys.a) + +(this.keys.ArrowRight || this.keys.d))
        dir.y = (-(this.keys.ArrowUp || this.keys.w) + +(this.keys.ArrowDown || this.keys.s))

        if (+dir.x && +dir.y) {
            const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
            dir.x /= dirLength
            dir.y /= dirLength
        }

        this.x += dir.x * this.speed * dt 
        this.y += dir.y * this.speed * dt 
    }

    private keyDown(e: KeyboardEvent) {
        this.keys[e.key] = true
    }

    private keyUp(e: KeyboardEvent) {
        this.keys[e.key] = false
    }
}

window.onload = function () {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    canvas.width = GAME_WIDTH
    canvas.height = GAME_HEIGHT
    const gfx = canvas.getContext('2d')

    const player = new Player(2048, 2048)
    const cam = new Camera(0, 0)
    const bg = new Background()

    class Amogus extends Game {
        public update(dt: number) {
            player.update(dt)
            cam.lookAt(player.x, player.y)
        }
        
        public draw(gfx: CanvasRenderingContext2D) {
            gfx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

            bg.draw(gfx, cam.xView, cam.yView)
            player.draw(gfx, cam.xView, cam.yView)
        }
    }

    new Amogus(gfx).start()
}
