import Level from "./Level"
import Player from "./Player"
import Renderer from "./Renderer"
import SocketManager from "./SocketManager"

type Entities = { [socketId: string]: Player }

export default class EntityManager {
    private static _instance: EntityManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }
    
    public entities: Entities = {}

    public level: Level | null = null

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

    public setLevel(level: Level | null) {
        this.level = level
    }
}
