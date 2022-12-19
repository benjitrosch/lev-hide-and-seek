import {
    GAME_WIDTH,
    GAME_HEIGHT,
    TILE_SIZE,
} from '../shared/constants'

import { Asset, Sprite } from "./Assets"
import Renderer from './Renderer'

type LevelData = {
    title: string
    bg: string
    width: number
    height: number
    startX: number
    startY: number
    blocks: number[]
}

export default class Level extends Asset {
    public title: string = 'undefined_level'

    public width: number = 0
    public height: number = 0

    public get rows() {
        return ~~(this.width / TILE_SIZE)
    }

    public get cols() {
       return (this.height / TILE_SIZE)
    }

    public startX: number = 0
    public startY: number = 0

    public blocks: boolean[] = []

    private sprite: Sprite
    public loaded: boolean = false

    constructor(filePath: string) {
        super(filePath)

        fetch(this.filePath)
            .then((res) => res.json())
            .then((data: LevelData) => {
                const { title, bg, width, height, startX, startY, blocks } = data

                this.title = title
                
                this.width = width
                this.height = height

                this.startX = startX
                this.startY = startY
        
                this.blocks = blocks.map((b) => !!b)

                this.sprite = new Sprite(bg)
                this.loaded = true
            })
    }
    
    public draw(gfx: Renderer, xView: number, yView: number) {
        // render background image
        if (this.sprite?.loaded)
        {
            if (!this.sprite.loaded) return
            
            let w = GAME_WIDTH
            let h = GAME_HEIGHT
            
            if (this.sprite.image.width - xView < w)
            w = this.sprite.image.width - xView
            if (this.sprite.image.height - yView < h)
            h = this.sprite.image.height - yView
            
            gfx.ctx.drawImage(this.sprite.image, xView, yView, w, h, 0, 0, w, h)
        }
        
        // render individual blocks
        if (this.loaded)
        {
            let w = GAME_WIDTH
            let h = GAME_HEIGHT

            if (this.width * TILE_SIZE - xView < w)
                w = this.width * TILE_SIZE - xView
            if (this.height * TILE_SIZE - yView < h)
                h = this.height * TILE_SIZE - yView

            const startX = Math.max(0, ~~(xView / TILE_SIZE))
            const startY = Math.max(0, ~~(yView / TILE_SIZE))
            
            const endX = Math.min(this.rows, startX + w / TILE_SIZE + 1)
            const endY = Math.min(this.cols, startY + h / TILE_SIZE + 1)

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const block = this.blocks[x + y * this.rows]

                    if (block) {
                        gfx.ctx.save()
                        gfx.ctx.fillStyle = 'black'
                        gfx.ctx.strokeStyle = 'black'
                        gfx.ctx.lineWidth = 1
                        gfx.ctx.beginPath()
                        gfx.ctx.rect(
                            x * TILE_SIZE - xView,
                            y * TILE_SIZE - yView,
                            1 * TILE_SIZE,
                            1 * TILE_SIZE
                        )
                        gfx.ctx.fill()
                        gfx.ctx.stroke()
                        gfx.ctx.restore()
                    }
                }
            }
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (this.loaded)
        {
            let w = GAME_WIDTH
            let h = GAME_HEIGHT

            if (this.width * TILE_SIZE - xView < w)
                w = this.width * TILE_SIZE - xView
            if (this.height * TILE_SIZE - yView < h)
                h = this.height * TILE_SIZE - yView

            const startX = Math.max(0, ~~(xView / TILE_SIZE))
            const startY = Math.max(0, ~~(yView / TILE_SIZE))
            
            const endX = Math.min(this.rows, startX + w / TILE_SIZE + 1)
            const endY = Math.min(this.cols, startY + h / TILE_SIZE + 1)

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const block = this.blocks[x + y * this.rows]

                    if (block) {
                        gfx.ctx.save()
                        gfx.ctx.strokeStyle = "red"
                        gfx.ctx.lineWidth = 1
                        gfx.ctx.beginPath()
                        gfx.ctx.rect(
                            x * TILE_SIZE - xView,
                            y * TILE_SIZE - yView,
                            1 * TILE_SIZE,
                            1 * TILE_SIZE
                        )
                        gfx.ctx.stroke()
                        gfx.ctx.restore()
                    }
                }
            }
        }  
    }

    public check(x: number, y: number) {
        return this.blocks[x + y * this.rows]
    }
}
