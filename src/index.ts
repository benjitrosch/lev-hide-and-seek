/// CONSTANTS ///
const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const WORLD_WIDTH = 7833
const WORLD_HEIGHT = 4524

const ANIM_FRAMERATE = 0.041

const SEEK_SPEED = 480
const HIDE_SPEED = 512  

const INTERACT_DISTANCE = 256
/////////////////

/**
 * gore game loop to call update and draw methods
 * on a fixed 60fps timstep
 */
abstract class Game {
    private gfx: Renderer

    private static readonly TIMESTEP = 1000 / 60
    private previousTime = 0
    private accumulatedTime = 0

    constructor(ctx: CanvasRenderingContext2D) {
        this.gfx = new Renderer(ctx)
    }

    /**
     * call to begin the game loop
     */
    public start() {
        this.run(performance.now())
    }

    protected run(currentTime: number) {
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
     protected abstract update(dt: number)
    /**
     * renders current game state
     * @param gfx canvas rendering context
     */
     protected abstract draw(gfx: Renderer)
}

class Renderer {
    public ctx: CanvasRenderingContext2D
  
    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx
    }
  
    public clearScreen() {
        this.ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    }
  
    public rectangle(x: number, y: number, w: number, h: number, color = "red") {
        this.ctx.save()
  
        this.ctx.beginPath()
        this.ctx.rect(x, y, w, h)
        this.ctx.fillStyle = color
        this.ctx.fill()
  
        this.ctx.restore()
    }
  
    public emptyRectangle(x: number, y: number, w: number, h: number, lineWidth = 2, color = "red") {
        this.ctx.save()
        
        this.ctx.strokeStyle = color
        this.ctx.lineWidth = lineWidth
        
        this.ctx.beginPath()
        this.ctx.strokeRect(x, y, w, h)
        this.ctx.stroke()
        
        this.ctx.restore()
    }
  
    public line(x0: number, x1: number, y0: number, y1: number, lineWidth = 4, color = "red") {
        this.ctx.save()
        
        this.ctx.strokeStyle = color
        this.ctx.lineWidth = lineWidth
        
        this.ctx.beginPath()
        this.ctx.moveTo(x0, y0)
        this.ctx.lineTo(x1, y1)
        this.ctx.stroke()
        
        this.ctx.restore()
    }
  
    public text(
        text: string,
        x: number,
        y: number,
        color = "white",
        align = "center",
        size = 16,
        font: Font | null = null
    ) {        
        if (font != null)
          this.ctx.font = font.name
        
        this.fontSize(this.ctx.font, size)
        
        this.ctx.textAlign = align as CanvasTextAlign
        this.ctx.fillStyle = color
        this.ctx.fillText(text, x, y)        
    }
  
    public fontSize(font: string, size: number) {
        this.ctx.font = font.replace(/\d+px/, `${size}px`)
    }
  
    public measureText(text: string, size = 16, font: Font = null) {
        this.ctx.save()
        if (font != null)
          this.ctx.font = font.name
        this.fontSize(this.ctx.font, size)
        const metrics = this.ctx.measureText(text)
        this.ctx.restore()
        return [metrics.width, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent]
    }
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

type Animations = { [key: string]: Sprite[] }

/** collection of sprites */
class Animator {
    public animations: Animations
    private animation: keyof Animations

    public frame: number
    private time: number

    constructor(animation: keyof Animations, animations: Animations) {
        this.animations = animations
        this.animation = animation

        this.frame = 0
        this.time = 0
    }

    public update(dt: number) {
        this.time += dt
        if (this.time >= ANIM_FRAMERATE) {
            this.time = 0
            this.frame++
            this.frame = this.frame % this.animations[this.animation].length
        }
    }

    public setAnimation(animation: keyof Animations) {
        if (this.animation === animation) return
        this.animation = animation
        this.frame = 0
        this.time = 0
    }

    public getSprite() {
        return this.animations[this.animation][this.frame]
    }
}

/** font asset loaded as fontface rather than from css */
class Font extends Asset {
    private font: FontFace
    public name: string = ''
    public loaded: boolean = false
  
    constructor(name: string, path: string) {
        super(path)
        
        this.font = new FontFace(name, `url(${this.filePath})`)
        this.font.load().then((font) => {
            document.fonts.add(font);
            this.name = '12px ' + name
            this.loaded = true
        })
    }
}

class Background {
    private sprite: Sprite

    constructor() {
        this.sprite = new Sprite('map.jpeg')
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        if (!this.sprite.loaded) return

        let w = GAME_WIDTH
	    let h = GAME_HEIGHT

	    if (this.sprite.image.width - xView < w)
	        w = this.sprite.image.width - xView
	    if (this.sprite.image.height - yView < h)
	        h = this.sprite.image.height - yView

	    gfx.ctx.drawImage(this.sprite.image, xView, yView, w, h, 0, 0, w, h)
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
        this.xView = this.lerp(this.xView, x - GAME_WIDTH / 2, 0.1)
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

class AABB {
    public x: number
    public y: number
    public w: number
    public h: number

    get top() {
        return this.y
    }

    get bottom() {
        return this.y + this.h
    }

    get left() {
        return this.x
    }

    get right() {
        return this.x + this.w
    }

    constructor(x: number, y: number, w: number, h: number) {
        this.x = x
        this.y = y
        this.w = w
        this.h = h
    }

    public check(aabb: AABB) {
        return (
            this.left < aabb.right &&
            this.right > aabb.left &&
            this.top < aabb.bottom &&
            this.bottom > aabb.top
        )
    }
    
    public translate(x: number, y: number): AABB {
        return new AABB(this.x + x, this.y + y, this.w, this.h)
    }
}

type Constructor<T> = abstract new (...args: any[]) => T

class EntityManager {
    private static _instance: EntityManager
    public static get Instance() {
        return this._instance || (this._instance = new this())
    }
    
    private entities: Entity[]

    private addQueue: Entity[]
    private removeQueue: Entity[]
  
    constructor() {
        this.entities = []

        this.addQueue = []
        this.removeQueue = []
    }
  
    public update(dt: number) {
        this.entities.forEach((entity) => entity.update(dt))
  
        this.entities = this.entities.filter(
            (entity) => !this.removeQueue.map((r) => r.uuid).includes(entity.uuid)
        )
        this.entities = this.entities.concat(this.addQueue)

        this.addQueue = []
        this.removeQueue = []
    }
  
    public draw(gfx: Renderer, xView: number, yView: number) {
        this.entities.forEach((entity) => entity.draw(gfx, xView, yView))
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        this.entities.forEach((entity) => entity.drawDebug(gfx, xView, yView))
    }
  
    public addEntity<T extends Entity>(entity: T) {
        this.addQueue.push(entity)
    }
  
    public removeEntity<T extends Entity>(entity: T) {
        this.removeQueue.push(entity)
    }

    public getOfType<T extends Entity>(type: Constructor<T>): T[] {
        return <T[]>this.entities.filter((e) => e instanceof type)
    }
}

abstract class Entity {
    public uuid: string

    public x: number
    public y: number
    public w: number
    public h: number

    get center() {
        return [this.x + this.w / 2, this.y + this.h / 2]
    }

    constructor(x: number, y: number, w: number, h: number) {
        this.x = x
        this.y = y
        this.w = w
        this.h = h

        // generate random unique identifier
        this.uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0, v = c == 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
        })
    }

    public abstract update(dt: number)
    public abstract draw(gfx: Renderer, xView: number, yView: number)
    public drawDebug(gfx: Renderer, xView: number, yView: number) {}
}

enum Role {
    HIDE = "hide",
    SEEK = "seek",
    SPEC = "spectate"
}

class Player extends Entity {
    // status
    public role: Role
    private speed: number

    // keyboard events
    private keys: Record<string, boolean>

    // animation
    private animator: Animator
    private facing: boolean = true

    // collision
    public aabb: AABB

    // interact
    public target: Interactive | null = null

    constructor(role: Role, x: number, y: number) {
        super(x, y, 96, 128)

        this.role = role
        switch (role) {
            case Role.HIDE:
                this.speed = HIDE_SPEED
                break

            case Role.SEEK:
                this.speed = SEEK_SPEED
                break
        }

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

        this.animator = new Animator("idle", {
            idle: [new Sprite("idle.png"),],
            walk: [
                new Sprite("Walk0001.png"),
                new Sprite("Walk0002.png"),
                new Sprite("Walk0003.png"),
                new Sprite("Walk0004.png"),
                new Sprite("Walk0005.png"),
                new Sprite("Walk0006.png"),
                new Sprite("Walk0007.png"),
                new Sprite("Walk0008.png"),
                new Sprite("Walk0009.png"),
                new Sprite("Walk0010.png"),
                new Sprite("Walk0011.png"),
                new Sprite("Walk0012.png"),
            ],
        })

        this.aabb = new AABB(16 - this.w / 2, 64 - this.h / 2, 64, 64)
    }

    public update(dt: number) {
        // step animation state
        this.animator.update(dt)

        // move player
        const dir = { x: 0, y: 0 }
        dir.x = (-(this.keys.ArrowLeft || this.keys.a) + +(this.keys.ArrowRight || this.keys.d))
        dir.y = (-(this.keys.ArrowUp || this.keys.w) + +(this.keys.ArrowDown || this.keys.s))

        if (!!dir.x) this.facing = dir.x > 0

        if (!!dir.x || !!dir.y) this.animator.setAnimation("walk")
        else this.animator.setAnimation("idle")

        if (+dir.x && +dir.y) {
            const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
            dir.x /= dirLength
            dir.y /= dirLength
        }

        this.x += dir.x * this.speed * dt 
        this.y += dir.y * this.speed * dt 

        // check for closest nearby interactive entity
        this.target = null
        let min = INTERACT_DISTANCE
        EntityManager.Instance.getOfType(Interactive).forEach((e) => {
            const [x, y] = e.center

            const v0 = this.x - x
            const v1 = this.y - y
            const distance = Math.sqrt((v0 * v0) + (v1 * v1))

            if (distance < min) {
                min = distance
                this.target = e
            }
        })
        
        if (!!this.target && (!!this.keys.e || !!this.keys[' ']))
            this.target.interact()
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        const sprite = this.animator.getSprite()
        if (sprite.loaded) {
            gfx.ctx.save()

            if (!this.facing) {
                // gfx.ctx.translate(GAME_WIDTH, 0)
                // gfx.ctx.scale(-1, 1)
            }

            gfx.ctx.drawImage(
                sprite.image,
                0,
                0,
                sprite.image.width,
                sprite.image.height,
                this.x - this.w / 2 - xView,
                this.y - this.h / 2 - yView,
                this.w,
                this.h
            )

            gfx.ctx.restore()
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (this.target) {
            const [x, y] = this.target.center
            gfx.line(
                this.x - xView,
                x - xView,
                this.y  - yView,
                y - yView,
                2,
                "#00ff00"
            )
        }
            
        let collides = false
        EntityManager.Instance.getOfType(TestCollider).forEach((e) => {
            if (this.aabb.translate(this.x, this.y).check(new AABB(e.x, e.y, e.w, e.h)))
                collides = true
        })

        gfx.emptyRectangle(
            this.x - this.w / 2 - xView,
            this.y - this.h / 2 - yView,
            this.w,
            this.h,
            1,
            "yellow"
        )

        gfx.emptyRectangle(
            this.aabb.x + this.x - xView,
            this.aabb.y + this.y - yView,
            this.aabb.w,
            this.aabb.h,
            2,
            collides ? "#00ff00" : "#ff0000"
        )
    }

    private keyDown(e: KeyboardEvent) {
        this.keys[e.key] = true
    }

    private keyUp(e: KeyboardEvent) {
        this.keys[e.key] = false
    }
}

/**
 * base class for entities that
 * the player can target/interact with
 */
abstract class Interactive extends Entity {
    constructor(x: number, y: number, w: number, h: number) {
        super(x, y, w, h)
    }

    public abstract interact()

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        gfx.rectangle(
            this.x - xView,
            this.y - yView,
            this.w,
            this.h,
            "#ff000055"
        )
    }
}

class TestInteract extends Interactive {
    public update(dt: number) {}
    public draw(gfx: Renderer) {}

    public interact() {
        console.log(`you interacted with ${this.uuid}!`)
    }
}

class TestCollider extends Entity {
    constructor(x: number, y: number, w: number, h: number) {
        super(x, y, w, h)
    }

    public update(dt: number) {}
    public draw(gfx: Renderer, xView: number, yView: number) {}

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        gfx.emptyRectangle(
            this.x - xView,
            this.y - yView,
            this.w,
            this.h
        )
    }
}

window.onload = function () {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    canvas.width = GAME_WIDTH
    canvas.height = GAME_HEIGHT
    canvas.style.background = "black"
    const ctx = canvas.getContext('2d')

    const cam = new Camera(0, 0)
    const bg = new Background()

    const player = new Player(Role.HIDE, 2048, 2048)

    EntityManager.Instance.addEntity(player)
    EntityManager.Instance.addEntity(new TestInteract(1600, 1800, 64, 64))
    EntityManager.Instance.addEntity(new TestInteract(0, 0, 64, 64))
    EntityManager.Instance.addEntity(new TestCollider(1800, 1800, 640, 256))
    
    class Amogus extends Game {
        public debug: boolean = true
        
        protected update(dt: number) {
            EntityManager.Instance.update(dt)
            cam.lookAt(player.x, player.y)
        }
        
        protected draw(gfx: Renderer) {
            gfx.clearScreen()

            bg.draw(gfx, cam.xView, cam.yView)
            
            EntityManager.Instance.draw(gfx, cam.xView, cam.yView)

            if (this.debug) this.drawDebug(gfx)
        }

        private drawDebug(gfx: Renderer) {
            EntityManager.Instance.drawDebug(gfx, cam.xView, cam.yView)

            // display player uuid
            const uuidText = `uuid: ${player.uuid}`
            const [uuidW, uuidH] = gfx.measureText(uuidText, 24)
            gfx.text(uuidText, 0, uuidH, "white", "left", 24)

            // display player role
            const roleText = `role: ${player.role}`
            const [roleW, roleH] = gfx.measureText(uuidText, 24)
            gfx.text(roleText, 0, uuidH + roleH, "white", "left", 24)
            
            // display player position
            const posText = `x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`
            const [posW, posH] = gfx.measureText(posText, 24)
            gfx.text(posText, 0, uuidH + roleH + posH, "white", "left", 24)
        }
    }

    new Amogus(ctx).start()
}
