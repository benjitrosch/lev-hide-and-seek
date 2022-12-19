import {
    GAME_WIDTH,
    GAME_HEIGHT,
} from '../shared/constants'
import { lerp } from '../shared/utils'

import EntityManager from './EntityManager'
import Level from './Level'

/** basic 2d camera to define viewport bounds */
export default class Camera {
    private static _instance: Camera
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public xView: number = 0
    public yView: number = 0

    // center the camera viewport on a position
    public lookAt(x: number, y: number, ease: number = 0.1) {
        this.xView = lerp(this.xView, x - GAME_WIDTH / 2, ease)
        this.yView = lerp(this.yView, y - GAME_HEIGHT / 2, ease)

        const level = EntityManager.instance.level
        if (level)
            this.clamp(level)
    }

    // restrict within game bounds (between origin and total area)
    private clamp(level: Level) {
        this.xView = Math.min(this.xView, level.width - GAME_WIDTH)
        this.xView = Math.max(this.xView, 0)

        this.yView = Math.min(this.yView, level.height - GAME_HEIGHT)
        this.yView = Math.max(this.yView, 0)
    }
}
