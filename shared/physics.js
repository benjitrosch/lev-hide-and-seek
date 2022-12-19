const {
    PLAYER_SPEED,
    PLAYER_COLLIDER_SIZE,
    PLAYER_COLLIDER_OFFSET,
    TILE_SIZE,
} = require('../shared/constants')

const INPUT_LEFT    = 1
const INPUT_RIGHT   = 2
const INPUT_UP      = 4
const INPUT_DOWN    = 8

function stepPhysics(player, x, y, input, level, dt) {
    const dir = { x: 0, y: 0 }
    dir.x = (-(!!(input & INPUT_LEFT)) + +(!!(input & INPUT_RIGHT)))
    dir.y = (-(!!(input & INPUT_UP)) + +(!!(input & INPUT_DOWN)))

    if (+dir.x && +dir.y) {
        const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
        dir.x /= dirLength
        dir.y /= dirLength
    }

    const dX = dir.x * PLAYER_SPEED * dt
    const dY = dir.y * PLAYER_SPEED * dt

    // if a valid level was loaded
    if (player.alive && level) {
        // horizontal collision resolution
        if (Math.abs(dX) > 0)
        {
            const collider = {
                x: x + PLAYER_COLLIDER_OFFSET + dX,
                y: y + PLAYER_COLLIDER_SIZE,
                w: PLAYER_COLLIDER_SIZE,
                h: PLAYER_COLLIDER_SIZE
            }

            const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
            const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
            const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
            const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

            const colliding = (
                level.check(topLeft.x, topLeft.y) ||
                level.check(topRight.x, topRight.y) || 
                level.check(botLeft.x, botLeft.y) || 
                level.check(botRight.x, botRight.y)
            )

            if (colliding) {
                if (Math.sign(dX) === 1) x = topLeft.x * TILE_SIZE + collider.w + PLAYER_COLLIDER_OFFSET - 1
                else x = topRight.x * TILE_SIZE - PLAYER_COLLIDER_OFFSET
            } else x += dX
        }
        
        // vertical collision resolution
        if (Math.abs(dY) > 0)
        {
            const collider = {
                x: x + PLAYER_COLLIDER_OFFSET,
                y: y + PLAYER_COLLIDER_SIZE + dY,
                w: PLAYER_COLLIDER_SIZE,
                h: PLAYER_COLLIDER_SIZE
            }

            const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
            const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
            const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
            const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

            const colliding = (
                level.check(topLeft.x, topLeft.y) ||
                level.check(topRight.x, topRight.y) || 
                level.check(botLeft.x, botLeft.y) || 
                level.check(botRight.x, botRight.y)
            )

            if (colliding) {
                if (Math.sign(dY) === 1) y = topLeft.y * TILE_SIZE + PLAYER_COLLIDER_SIZE / 2 - 1
                else y = botLeft.y * TILE_SIZE - PLAYER_COLLIDER_SIZE
            } else y += dY
        }
    } else {
        x += dX
        y += dY
    }

    return {
        dir,
        x,
        y
    }
}

module.exports = { stepPhysics }
