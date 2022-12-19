import {
    GAME_WIDTH,
    GAME_HEIGHT,
} from '../shared/constants'

import { Font } from './Assets'

export default class Renderer {
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
        return { w: metrics.width, h: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent }
    }
}
