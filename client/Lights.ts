import {
    GAME_WIDTH,
    GAME_HEIGHT,
    PLAYER_COLLIDER_SIZE,
} from '../shared/constants'
import {
    ROLE_SEEK
} from '../shared/enums'
import {
    Rectangle,
    checkAABBs
} from '../shared/collision'

import EntityManager from './EntityManager'
import Level from './Level'
import Renderer from "./Renderer"

/** light code from https://ncase.me/sight-and-light/ */
export function getIntersection(ray, segment){
	// RAY in parametric: Point + Delta*T1
	var r_px = ray.a.x
	var r_py = ray.a.y
	var r_dx = ray.b.x - ray.a.x
	var r_dy = ray.b.y - ray.a.y

	// SEGMENT in parametric: Point + Delta*T2
	var s_px = segment.a.x
	var s_py = segment.a.y
	var s_dx = segment.b.x - segment.a.x
	var s_dy = segment.b.y - segment.a.y

	// Are they parallel? If so, no intersect
	var r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy)
	var s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy)
	if (r_dx / r_mag == s_dx / s_mag && r_dy / r_mag == s_dy / s_mag) {
		// Unit vectors are the same.
		return null
	}

	// SOLVE FOR T1 & T2
	// r_px+r_dx*T1 = s_px+s_dx*T2 && r_py+r_dy*T1 = s_py+s_dy*T2
	// ==> T1 = (s_px+s_dx*T2-r_px)/r_dx = (s_py+s_dy*T2-r_py)/r_dy
	// ==> s_px*r_dy + s_dx*T2*r_dy - r_px*r_dy = s_py*r_dx + s_dy*T2*r_dx - r_py*r_dx
	// ==> T2 = (r_dx*(s_py-r_py) + r_dy*(r_px-s_px))/(s_dx*r_dy - s_dy*r_dx)
	var T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx)
	var T1 = (s_px + s_dx * T2 - r_px) / r_dx

	// Must be within parametic whatevers for RAY/SEGMENT
	if (T1 < 0) return null
	if (T2 < 0 || T2>1) return null

	// Return the POINT OF INTERSECTION
	return {
		x: r_px + r_dx * T1,
		y: r_py + r_dy * T1,
		param: T1
	}
}

type LightsPolygon = {
    x: number,
    y: number,
    angle: number,
    param: number
}[]

function getSightPolygon(pX: number, pY: number, xView: number, yView: number, level: Level) {
    const viewportAABB = new Rectangle(xView, yView, GAME_WIDTH, GAME_HEIGHT)

    const segments: {
        a: { x: number, y: number },
        b: { x: number, y: number }
    }[] = []

    // if (level && level.polygons) {
    //     level.polygons.forEach((polygon) => {
    //         if (checkAABBs(polygon.aabb, viewportAABB)) {
    //             let prev = polygon.vertices[0]
    //             polygon.vertices.slice(1).forEach((vertex) => {
    //                 segments.push({ a: { x: prev.x, y: prev.y }, b: { x: vertex.x, y: vertex.y } })
    //                 prev = vertex
    //             })
    //             segments.push({ a: { x: prev.x, y: prev.y }, b: { x: polygon.vertices[0].x, y: polygon.vertices[0].y } })
    //         }
    //     })
    // }

    // add screen border
    segments.push({ a: { x: xView, y: yView }, b: { x: xView + GAME_WIDTH, y: yView } })
    segments.push({ a: { x: xView + GAME_WIDTH, y: yView }, b: { x: xView + GAME_WIDTH, y: yView + GAME_HEIGHT } })
    segments.push({ a: { x: xView + GAME_WIDTH, y: yView + GAME_HEIGHT }, b: { x: xView, y: yView + GAME_HEIGHT } })
    segments.push({ a: { x: xView, y: yView + GAME_HEIGHT }, b: { x: xView, y: yView } })

    const points = new Set<{ x: number, y: number, angle: number }>()

    segments.forEach((segment) => {
        points.add({ ...segment.a, angle: 0 })
        points.add({ ...segment.b, angle: 0 })
    })

    const angles = new Set<number>()
    points.forEach((point) => {
        const angle = Math.atan2(point.y - pY, point.x - pX)
        point.angle = angle
        angles.add(angle - 0.00001)
        angles.add(angle)
        angles.add(angle + 0.00001)
    })

    let intersects: LightsPolygon = []
    for (let i = 0; i < angles.size; i++) {
        const angle = [...angles][i]

        const dx = Math.cos(angle)
		const dy = Math.sin(angle)

        const ray = {
			a:{ x: pX, y: pY },
			b:{ x: pX + dx, y: pY + dy }
		}

        let closestIntersect: any | null = null
        for (let j = 0; j < segments.length; j++) {
            const intersect = getIntersection(ray, segments[j])
            if (!intersect) continue
			if (!closestIntersect || intersect.param < closestIntersect.param)
				closestIntersect = intersect
        }

        if(!closestIntersect) continue
		closestIntersect.angle = angle

		// Add to list of intersects
		intersects.push(closestIntersect)
    }

    intersects = intersects.sort((a,b) => a.angle - b.angle)

    return intersects
}

function drawLightsPolygon(gfx: Renderer, polygon: LightsPolygon, fillStyle: string, xView: number, yView: number) {
    gfx.ctx.save()
	gfx.ctx.fillStyle = fillStyle
	gfx.ctx.beginPath()
    gfx.ctx.moveTo(polygon[0].x - xView, polygon[0].y - yView)
	for (let i = 1; i < polygon.length; i++) {
		const intersect = polygon[i]
		gfx.ctx.lineTo(intersect.x - xView, intersect.y - yView)
	}
	gfx.ctx.fill()
    gfx.ctx.restore()
}

export function drawLights(gfx: Renderer, xView: number, yView: number) {
    const { player, level } = EntityManager.instance
    if (!player || !level) return

    const { x: pX, y: pY } = player.center
    const PLAYER_Y_OFFSET = PLAYER_COLLIDER_SIZE / 2

    // const fuzzyRadius = 32
	const polygons = [getSightPolygon(pX, pY + PLAYER_Y_OFFSET, xView, yView, level)]
    // for(let angle=0; angle < Math.PI * 2; angle += (Math.PI * 2) / 10) {
	// 	const dx = Math.cos(angle) * fuzzyRadius
	// 	const dy = Math.sin(angle) * fuzzyRadius
	// 	polygons.push(getSightPolygon(pX + dx, pY + PLAYER_Y_OFFSET + dy, xView, yView, level))
	// }

    // gfx.ctx.save()
    // gfx.ctx.filter = "blur(16px)"
    // for (let i=1; i < polygons.length; i++)
	// 	drawLightsPolygon(gfx, polygons[i], "rgba(255,255,255,0.3)", xView, yView)
    // gfx.ctx.restore()
    drawLightsPolygon(gfx, polygons[0], "#fff", xView, yView)
}

export function drawLightsDebug(gfx: Renderer, xView: number, yView: number) {
    const { player, level } = EntityManager.instance
    if (!player || !level) return

    const { x: pX, y: pY } = player.center
    const PLAYER_Y_OFFSET = PLAYER_COLLIDER_SIZE / 2

	const polygon = getSightPolygon(pX, pY + PLAYER_Y_OFFSET, xView, yView, level)

    gfx.ctx.save()
    gfx.ctx.strokeStyle = "#f55"
    for (let i = 0; i < polygon.length; i++) {
        const intersect = polygon[i]
        gfx.ctx.beginPath()
        gfx.ctx.moveTo(pX - xView, pY + PLAYER_Y_OFFSET - yView)
        gfx.ctx.lineTo(intersect.x - xView, intersect.y - yView)
        gfx.ctx.stroke()
    }
    gfx.ctx.restore()
}

export function drawSpotlight(gfx: Renderer, xView: number, yView: number) {
    const player = EntityManager.instance.player
    if (!player) return
    const { x: pX, y: pY } = player.center

    const spotlight = gfx.ctx.createRadialGradient(
        pX - xView,
        pY - yView,
        PLAYER_COLLIDER_SIZE,
        pX - xView,
        pY - yView,
        PLAYER_COLLIDER_SIZE * 10
    )

    spotlight.addColorStop(player.role === ROLE_SEEK ? 0.1 : 0.2, 'transparent')
    spotlight.addColorStop(player.role === ROLE_SEEK ? 0.4 : 1.0, 'black')

    gfx.ctx.fillStyle = spotlight
    gfx.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
}
