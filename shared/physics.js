const { PLAYER_SPEED } = require('../shared/constants')

const { broadPhaseCollisionDetection } = require('../shared/collision')

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

    if (player.alive && level && level.polygons && level.polygons.length) {
        const { x: newX, y: newY } = broadPhaseCollisionDetection(
            { x, y },
            { x: x + dX, y: y + dY },
            level.polygons
        )
        return {
            dir,
            x: newX,
            y: newY
        }
    } else {
        return {
            dir,
            x: x + dX,
            y: y + dY
        }
    }
}

module.exports = { stepPhysics }
