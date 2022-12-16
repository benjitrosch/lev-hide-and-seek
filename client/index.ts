const io = require("socket.io-client")

/// CONSTANTS ///
const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const WORLD_WIDTH = 7833
const WORLD_HEIGHT = 4524

const ANIM_FRAMERATE = 0.041

const SEEK_SPEED = 480
const HIDE_SPEED = 512  

const INTERACT_DISTANCE = 256

const PLAYER_WIDTH = 96
const PLAYER_HEIGHT = 128

const CLIENTSIDE_DISTANCE_CORRECTION_THRESHOLD = 48
/////////////////

class SocketManager {
    private static _instance: SocketManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public socket//: Socket<ServerToClientEvents, ClientToServerEvents>

    public get socketId() {
        return this.socket.id
    }

    public init() {
        this.socket = io()

        // connect to lobby
        this.socket.on('connect', () => {
            // add self to entity manager and
            // emit 'join' socket event
            const x = 2048 + Math.random() * 256
            const y = 2048 + Math.random() * 256
            this.socket.emit('join', { name: "Benji", x, y })
            EntityManager.instance.addEntity(
                this.socketId,
                new Player(true, "Benji", this.socketId, x, y)
            )
        })

        // get latest players in lobby
        this.socket.on('updateLobby', (players) => {
            const updatedPlayers: { [socketId: string]: boolean } = {}

            for (let id in players) {
                // add new players to entity manager
                if (!(id in EntityManager.instance.entities) && id !== this.socketId) {
                    const { name } = players[id]
                    EntityManager.instance.addEntity(
                        id,
                        new Player(false, name, id, 0, 0)
                    )
                }

                updatedPlayers[id] = true
            }

            // remove disconnected players
            for (let id in EntityManager.instance.entities) {
                if (!(id in updatedPlayers))
                    EntityManager.instance.removeEntity(id)
            }
        })

        // get player inputs from server
        this.socket.on('updateInputs', (inputs) => {
            for (let id in inputs) {
                if (id in EntityManager.instance.entities) {
                    const { keys } = inputs[id]
                    EntityManager.instance.entities[id].keys = keys
                }
            }
        })

        // get position calculated from server for authoritative sync
        this.socket.on('updatePositions', (positions) => {
            for (let id in positions) {
                if (id in EntityManager.instance.entities) {
                    const { x, y } = positions[id]
                    const player = EntityManager.instance.entities[id]

                    const v0 = player.x - x
                    const v1 = player.y - y
                    const distance = Math.sqrt((v0 * v0) + (v1 * v1))

                    if (id !== this.socketId || distance > CLIENTSIDE_DISTANCE_CORRECTION_THRESHOLD) {
                        player.x = x
                        player.y = y
                    }
                }
            }
        })
    }
}

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

    public textOutline(
        text: string,
        x: number,
        y: number,
        color = "white",
        outline = "black",
        align = "center",
        size = 16,
        thickness = 8,
        font: Font | null = null
    ) {        
        if (font != null)
          this.ctx.font = font.name
        
        this.fontSize(this.ctx.font, size)
        
        this.ctx.textAlign = align as CanvasTextAlign

        this.ctx.strokeStyle = outline
        this.ctx.lineWidth = thickness
        this.ctx.strokeText(text, x, y)
        
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
        return [metrics.width, metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent]
    }
}
  

/** base asset class to handle file loading */
abstract class Asset {
    protected filePath: string
    public fileName: string
  
    constructor(filePath: string) {
        this.filePath = `./public/${filePath}`
  
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

type Entities = { [socketId: string]: Player }

class EntityManager {
    private static _instance: EntityManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }
    
    public entities: Entities = {}

    public get player(): Player | null {
        return this.entities[SocketManager.instance.socketId]
    }

    public update(dt: number) {
        Object.values(this.entities)
            .forEach((entity) => entity.update(dt))
    }
  
    public draw(gfx: Renderer, xView: number, yView: number) {
        Object.values(this.entities)
            .sort((a, b) => a.y - b.y)
            .forEach((entity) => entity.draw(gfx, xView, yView))
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        Object.values(this.entities)
            .forEach((entity) => entity.drawDebug(gfx, xView, yView))
    }
  
    public addEntity(socketId: string, entity: Player) {
        this.entities[socketId] = entity
    }
  
    public removeEntity(socketId: string) {
        if (socketId in this.entities)
            delete this.entities[socketId]
    }
}

enum Role {
    HIDE = "hide",
    SEEK = "seek",
    SPEC = "spectate"
}

class Player {
    // online
    public socketId: string
    public username: string
    
    // status
    public player: boolean
    public role: Role
    private speed: number = HIDE_SPEED

    // keyboard events
    public keys: { left: boolean, right: boolean, up: boolean, down: boolean, action: boolean }
    private hasPressed: boolean = false
    private hasPressedAction: boolean = false

    // animation
    private animator: Animator
    private facing: boolean = true

    // transform
    public x: number
    public y: number
    public w: number
    public h: number

    get center() {
        return [this.x + this.w / 2, this.y + this.h / 2]
    }

    // collision
    public aabb: AABB

    // interact
    public target: Player | null = null

    constructor(player: boolean, username: string, socketId: string, x: number, y: number) {
        this.x = x
        this.y = y
        this.w = PLAYER_WIDTH
        this.h = PLAYER_HEIGHT

        this.socketId = socketId
        this.username = username

        this.player = player

        // this.role = role
        // switch (role) {
        //     case Role.HIDE:
        //         this.speed = HIDE_SPEED
        //         break

        //     case Role.SEEK:
        //         this.speed = SEEK_SPEED
        //         break
        // }

        // this.keys = {
        //     // movement arrows
        //     ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
        //     // movement wasd
        //     w: false, a: false, s: false, d: false,
        //     // interact
        //     ' ': false, e: false
        // }

        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false,
            action: false,
        }

        if (this.player) {
            document.onkeydown = (e) => this.keyDown(e)
            document.onkeyup = (e) => this.keyUp(e)
        }

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

        this.aabb = new AABB(16, 64, 64, 64)
    }

    public update(dt: number) {
        // step animation state
        this.animator.update(dt)

        // move player
        const dir = { x: 0, y: 0 }
        dir.x = (-this.keys.left + +this.keys.right)
        dir.y = (-this.keys.up + +this.keys.down)

        if (!!dir.x) this.facing = dir.x > 0

        if (!!dir.x || !!dir.y) this.animator.setAnimation("walk")
        else this.animator.setAnimation("idle")

        if (this.player) {
            if (+dir.x && +dir.y) {
                const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
                dir.x /= dirLength
                dir.y /= dirLength
            }

            this.x += dir.x * this.speed * dt 
            this.y += dir.y * this.speed * dt 
        }

        // check for closest nearby interactive entity
        this.target = null
        let min = INTERACT_DISTANCE
        Object.keys(EntityManager.instance.entities).forEach((id) => {
            if (id !== this.socketId) {
                const e = EntityManager.instance.entities[id]
                const [x, y] = e.center

                const v0 = this.x - x
                const v1 = this.y - y
                const distance = Math.sqrt((v0 * v0) + (v1 * v1))

                if (distance < min) {
                    min = distance
                    this.target = e
                }
            }
        })
        
        if (!!this.target && this.hasPressedAction) {
            this.target.interact()
            this.hasPressedAction = false
        }
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        const sprite = this.animator.getSprite()
        if (sprite.loaded) {
            gfx.ctx.save()

            if (!this.facing) {
                // gfx.ctx.translate(GAME_WIDTH, 0)
                // gfx.ctx.scale(-1, 1)
            }

            gfx.textOutline(
                this.username,
                this.x + this.w / 2 - xView,
                this.y - yView,
                "white",
                "black",
                "center",
                24,
                4
            )

            gfx.ctx.drawImage(
                sprite.image,
                0,
                0,
                sprite.image.width,
                sprite.image.height,
                this.x - xView,
                this.y - yView,
                this.w,
                this.h
            )

            gfx.ctx.restore()
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (!this.player) return

        if (this.target) {
            const [pX, pY] = this.center
            const [tX, tY] = this.target.center
            gfx.line(
                pX - xView,
                tX - xView,
                pY  - yView,
                tY - yView,
                2,
                "#00ff00"
            )
        }

        gfx.emptyRectangle(
            this.x - xView,
            this.y - yView,
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
            "#ff0000"
        )
    }

    private keyDown(e: KeyboardEvent) {
        e.preventDefault()

        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                if (!this.keys.left) this.hasPressed = true
                this.keys.left = true
                break

            case 'd':
            case 'ArrowRight':
                if (!this.keys.right) this.hasPressed = true
                this.keys.right = true
                break

            case 'w':
            case 'ArrowUp':
                if (!this.keys.up) this.hasPressed = true
                this.keys.up = true
                break

            case 's':
            case 'ArrowDown':
                if (!this.keys.down) this.hasPressed = true
                this.keys.down = true
                break

            case ' ':
            case 'e':
                if (!this.keys.action) this.hasPressedAction = true
                this.keys.action = true
                break
        }

        if (this.hasPressed) {
            SocketManager.instance.socket.emit('input', this.keys)
            this.hasPressed = false
        }
    }

    private keyUp(e: KeyboardEvent) {
        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                this.keys.left = false
                break

            case 'd':
            case 'ArrowRight':
                this.keys.right = false
                break

            case 'w':
            case 'ArrowUp':
                this.keys.up = false
                break

            case 's':
            case 'ArrowDown':
                this.keys.down = false
                break

            case ' ':
            case 'e':
                this.keys.action = false
                break
        }

        SocketManager.instance.socket.emit('input', this.keys)
    }

    public interact() {
        console.log("hehe!")
    }
}

window.onload = function () {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    canvas.width = GAME_WIDTH
    canvas.height = GAME_HEIGHT
    canvas.style.background = "black"
    const ctx = canvas.getContext('2d')

    SocketManager.instance.init()

    const cam = new Camera(0, 0)
    const bg = new Background()
    
    class Amogus extends Game {
        public debug: boolean = true
        
        protected update(dt: number) {
            EntityManager.instance.update(dt)

            const player = EntityManager.instance.player
            if (!player) return

            const [pX, pY] = player.center
            cam.lookAt(pX, pY)
        }
        
        protected draw(gfx: Renderer) {
            gfx.clearScreen()

            bg.draw(gfx, cam.xView, cam.yView)
            
            EntityManager.instance.draw(gfx, cam.xView, cam.yView)

            if (this.debug) this.drawDebug(gfx)
        }

        private drawDebug(gfx: Renderer) {
            EntityManager.instance.drawDebug(gfx, cam.xView, cam.yView)

            const player = EntityManager.instance.player
            if (!player) return

            // display player socket id
            const socketText = `socket id: ${player.socketId}`
            const [socketW, socketH] = gfx.measureText(socketText, 24)
            gfx.text(socketText, 8, socketH, "white", "left", 24)

            // display player role
            const roleText = `role: ${player.role}`
            const [roleW, roleH] = gfx.measureText(roleText, 24)
            gfx.text(roleText, 8, socketH + roleH, "white", "left", 24)
            
            // display player position
            const posText = `x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`
            const [posW, posH] = gfx.measureText(posText, 24)
            gfx.text(posText, 8, socketH + roleH + posH, "white", "left", 24)
        }
    }

    new Amogus(ctx).start()
}
