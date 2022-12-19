import {
    GAME_WIDTH,
    GAME_HEIGHT,
    ANIM_FRAMERATE,
    INTERACT_DISTANCE,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    PLAYER_COLLIDER_SIZE,
    PLAYER_COLLIDER_OFFSET,
    KILL_COOLDOWN
} from '../shared/constants'
import {
    ROLE_NONE,
    ROLE_READY,
    ROLE_HIDE,
    ROLE_SEEK,
    ROLE_SPEC,
    INPUT_LEFT,
    INPUT_RIGHT,
    INPUT_UP,
    INPUT_DOWN
} from '../shared/enums'
import { dist } from '../shared/utils'
import { stepPhysics } from '../shared/physics'

import { Sprite } from "./Assets"
import EntityManager from './EntityManager'
import { GameManager } from './Game'
import Renderer from './Renderer'
import SocketManager from './SocketManager'

export default class Player {
    // online
    public socketId: string
    public username: string
    
    // status
    public player: boolean
    public role: number
    public alive: boolean

    // keyboard events
    public keys: number = 0
    private actionDown: boolean = false
    private hasPressedKey: boolean = false
    private hasPressedAction: boolean = false

    // animation
    private animator: Animator
    private facing: boolean = true
    private useSprite: Sprite
    private killSprite: Sprite

    // transform
    public x: number
    public y: number
    public w: number
    public h: number

    private deadX: number = -1000
    private deadY: number = -1000

    get center() {
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 }
    }

    // collision
    get aabb() {
        return new AABB(this.x + PLAYER_COLLIDER_OFFSET, this.y + PLAYER_COLLIDER_SIZE, PLAYER_COLLIDER_SIZE, PLAYER_COLLIDER_SIZE)
    }

    // interact
    public target: Player | null = null
    public cooldown: number = KILL_COOLDOWN
    private cooldownInterval: ReturnType<typeof setInterval>

    constructor(username: string, role: number, socketId: string, player: boolean, alive: boolean) {
        this.x = 0
        this.y = 0
        this.w = PLAYER_WIDTH
        this.h = PLAYER_HEIGHT

        this.username = username
        this.socketId = socketId
        this.role = role

        this.player = player
        this.alive = alive

        if (this.player) {
            document.onkeydown = (e) => this.keyDown(e)
            document.onkeyup = (e) => this.keyUp(e)
        }

        this.animator = new Animator("idle", {
            idle: [new Sprite("sprites/idle.png")],
            walk: [
                new Sprite("sprites/Walk0001.png"),
                new Sprite("sprites/Walk0002.png"),
                new Sprite("sprites/Walk0003.png"),
                new Sprite("sprites/Walk0004.png"),
                new Sprite("sprites/Walk0005.png"),
                new Sprite("sprites/Walk0006.png"),
                new Sprite("sprites/Walk0007.png"),
                new Sprite("sprites/Walk0008.png"),
                new Sprite("sprites/Walk0009.png"),
                new Sprite("sprites/Walk0010.png"),
                new Sprite("sprites/Walk0011.png"),
                new Sprite("sprites/Walk0012.png"),
            ],
            ghost: [new Sprite("sprites/Ghost0001.png")],
            dead: [new Sprite("sprites/dead.png")],
        })

        this.useSprite = new Sprite("sprites/use.png")
        this.killSprite = new Sprite("sprites/kill.png")
    }
    
    public update(dt: number) {
        // step animation state
        this.animator.update(dt)

        // move player
        const { dir, x, y } = stepPhysics(this, this.x, this.y, this.keys, EntityManager.instance.level, dt)
        
        this.x = x
        this.y = y

        // logic based on input dir
        // (e.g. facing direction, current animation)
        if (!!dir.x) this.facing = dir.x > 0

        if (this.alive) {
            if (!!dir.x || !!dir.y) this.animator.setAnimation("walk")
            else this.animator.setAnimation("idle")
        }

        // interaction logic
        if (GameManager.instance.started) {
            // check for closest nearby interactive entity
            if (this.player && this.role === ROLE_SEEK) {
                this.target = null
                let min = INTERACT_DISTANCE
                Object.keys(EntityManager.instance.entities).forEach((id) => {
                    if (id !== this.socketId) {
                        const e = EntityManager.instance.entities[id]

                        // skip players who are already dead
                        if (e.role !== ROLE_SPEC) {
                            const { x, y } = e.center

                            const distance = dist({ x: this.x, y: this.y }, { x, y })

                            if (distance < min) {
                                min = distance
                                this.target = e
                            }
                        }
                    }
                })
                
                if (this.hasPressedAction) {
                    this.hasPressedAction = false

                    if (!!this.target && this.cooldown <= 0) {
                        this.target.interact()
                        this.target = null

                        this.cooldown = KILL_COOLDOWN
                    }
                }
            }
        } else {
            if (this.hasPressedAction) {
                this.hasPressedAction = false
                this.role = this.role === ROLE_READY ? ROLE_NONE : ROLE_READY

                SocketManager.instance.socket.emit('ready', { socketId: this.socketId, ready: this.role === ROLE_READY })
            }
        }
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        const sprite = this.animator.currentSprite
        if (sprite.loaded) {
            gfx.textOutline(
                this.username,
                (this.alive ? this.x : this.deadX) + this.w / 2 - xView,
                (this.alive ? this.y : this.deadY) - yView,
                this.alive ? "white" : "red",
                "black",
                "center",
                24,
                4
            )

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
                (this.alive ? this.x : this.deadX) - xView,
                (this.alive ? this.y : this.deadY) - yView,
                this.w,
                this.h
            )

            gfx.ctx.restore()

            if (!this.alive && !EntityManager.instance.player.alive) {
                gfx.ctx.save()
                gfx.ctx.globalAlpha = 0.6
                const sprite = this.animator.animations['ghost'][0]
                if (sprite.loaded) {
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
                }
                gfx.ctx.restore()
            }
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (!this.player) return

        if (this.target) {
            const { x: pX, y: pY } = this.center
            const { x: tX, y: tY } = this.target.center
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
            this.aabb.x - xView,
            this.aabb.y - yView,
            this.aabb.w,
            this.aabb.h,
            2,
            "#ff0000"
        )
    }

    public drawUI(gfx: Renderer) {
        if (!this.useSprite.loaded || !this.killSprite.loaded) return

        switch (this.role) {
            case ROLE_HIDE:
                break
            
            case ROLE_SEEK:
                gfx.ctx.save()
                gfx.ctx.globalAlpha = this.cooldown > 0 ? 0.5 : 1
                gfx.ctx.drawImage(
                    this.killSprite.image,
                    GAME_WIDTH - this.killSprite.image.width - 8,
                    GAME_HEIGHT - this.killSprite.image.height - 8
                )
                gfx.ctx.restore()

                if (this.cooldown > 0)
                    gfx.textOutline(
                        this.cooldown.toFixed(0).toString(),
                        GAME_WIDTH - this.killSprite.image.width / 2 - 8,
                        GAME_HEIGHT - this.killSprite.image.height / 2 - 8,
                        "white",
                        "black",
                        "center",
                        48,
                        4
                    )
                break
        }
    }

    private keyDown(e: KeyboardEvent) {
        // e.preventDefault()

        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                if (!(this.keys & INPUT_LEFT)) this.hasPressedKey = true
                this.keys |= INPUT_LEFT
                break

            case 'd':
            case 'ArrowRight':
                if (!(this.keys & INPUT_RIGHT)) this.hasPressedKey = true
                this.keys |= INPUT_RIGHT
                break

            case 'w':
            case 'ArrowUp':
                if (!(this.keys & INPUT_UP)) this.hasPressedKey = true
                this.keys |= INPUT_UP
                break

            case 's':
            case 'ArrowDown':
                if (!(this.keys & INPUT_DOWN)) this.hasPressedKey = true
                this.keys |= INPUT_DOWN
                break

            case ' ':
            case 'e':
                if (!this.actionDown) this.hasPressedAction = true
                this.actionDown = true
                break

            case 'r':
                this.role = ROLE_SEEK
                break
        }

        if (this.hasPressedKey) {
            SocketManager.instance.socket.emit('input', this.keys)
            this.hasPressedKey = false
        }
    }

    private keyUp(e: KeyboardEvent) {
        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                this.keys &= ~INPUT_LEFT
                break

            case 'd':
            case 'ArrowRight':
                this.keys &= ~INPUT_RIGHT
                break

            case 'w':
            case 'ArrowUp':
                this.keys &= ~INPUT_UP
                break

            case 's':
            case 'ArrowDown':
                this.keys &= ~INPUT_DOWN
                break

            case ' ':
            case 'e':
                this.actionDown = false
                break

            // toggle fullscreen
            case 'f':
                GameManager.instance.toggleFullscreen()
                break

            // activate debug mode
            case '`':
                GameManager.instance.debug = !GameManager.instance.debug
                break
        }

        SocketManager.instance.socket.emit('input', this.keys)
    }

    public setCooldownInterval() {
        this.cooldown = KILL_COOLDOWN
        this.cooldownInterval = setInterval(
            () => this.cooldown = Math.max(0, this.cooldown - 1),
            1000
        )
    }

    public clearCooldownInterval() {
        clearInterval(this.cooldownInterval)
    }

    public interact() {
        SocketManager.instance.socket.emit('kill', { socketId: this.socketId })
    }

    public kill() {
        this.role = ROLE_SPEC
        this.alive = false
        
        this.deadX = this.x
        this.deadY = this.y
        
        this.animator.setAnimation('dead')
    }
}

/** collision decection bounding box component */
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

type Animations = { [key: string]: Sprite[] }

/** collection of sprites */
class Animator {
    public animations: Animations
    private animation: keyof Animations

    public frame: number
    private time: number

    public get currentSprite() {
        return this.animations[this.animation][this.frame]
    }

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
}
