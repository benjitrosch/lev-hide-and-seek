/** linear interpolate (ease) towards position */
export const lerp = (a, b, alpha) => a + alpha * (b - a)

/** 2d vector distance method */
export const dist = (a, b) => {
    const v0 = a.x - b.x
    const v1 = a.y - b.y
    return Math.sqrt((v0 * v0) + (v1 * v1))
}
