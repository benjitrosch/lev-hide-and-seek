import {
    GAME_WIDTH,
    GAME_HEIGHT,
} from '../shared/constants'
import {
    Rectangle,
    Polygon,
    Vector2,
    checkAABBs
} from '../shared/collision'

import { Asset, Sprite } from "./Assets"
import Renderer from './Renderer'

type LevelData = {
    title: string
    bg: string
    width: number
    height: number
    startX: number
    startY: number
    polygons: { x: number, y: number }[][]
}

export default class Level extends Asset {
    public title: string = 'undefined_level'

    public width: number = 0
    public height: number = 0

    public startX: number = 0
    public startY: number = 0

    public polygons: Polygon[]

    private sprite: Sprite
    public loaded: boolean = false

    constructor(filePath: string) {
        super(filePath)

        fetch(this.filePath)
            .then((res) => res.json())
            .then((data: LevelData) => {
                const { title, bg, width, height, startX, startY, polygons } = data

                this.title = title
                
                this.width = width
                this.height = height

                this.startX = startX
                this.startY = startY
        
                this.polygons = polygons.map((polygon) => (
                    new Polygon(polygon.map((vertex) => (
                        new Vector2(vertex.x, vertex.y)
                    )))
                ))

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
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (this.loaded)
        {
            const viewportAABB = new Rectangle(xView, yView, GAME_WIDTH, GAME_HEIGHT)
            for (let i = 0; i < this.polygons.length; i++) {
                const polygon = this.polygons[i]
                if (checkAABBs(polygon.aabb, viewportAABB)) {
                    gfx.emptyRectangle(
                        polygon.aabb.x - xView,
                        polygon.aabb.y - yView,
                        polygon.aabb.width,
                        polygon.aabb.height,
                        2,
                        '#ffff0055'
                    )
                    gfx.ctx.fillStyle = '#0000ff22'
                    gfx.ctx.strokeStyle = 'red'
                    gfx.ctx.lineWidth = 2
                    gfx.ctx.beginPath()
                    gfx.ctx.save()
                    gfx.text(
                        `(${polygon.vertices[0].x}, ${polygon.vertices[0].y})`,
                        polygon.vertices[0].x - xView,
                        polygon.vertices[0].y - yView,
                        '#ffffffaa',
                        'center',
                        16
                    )
                    gfx.ctx.restore()
                    gfx.ctx.moveTo(polygon.vertices[0].x - xView, polygon.vertices[0].y - yView)
                    polygon.vertices.slice(1).forEach((v) => {
                        gfx.ctx.save()
                        gfx.text(
                            `(${v.x}, ${v.y})`,
                            v.x - xView,
                            v.y - yView,
                            '#ffffffaa',
                            'center',
                            16
                        )
                        gfx.ctx.restore()
                        gfx.ctx.lineTo(v.x - xView, v.y - yView)
                    })
                    gfx.ctx.closePath()
                    gfx.ctx.stroke()
                    gfx.ctx.fill()
                }
            }
        }  
    }
}
