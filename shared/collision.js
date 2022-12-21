const {
    PLAYER_COLLIDER_SIZE,
    PLAYER_COLLIDER_OFFSET
} = require('../shared/constants')

class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    get length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    // calculate the dot product of two vectors
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    // multiply a vector by a scalar value
    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    subtract(other) {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    normalize() {
        const length = this.length;
        return new Vector2(this.x / length, this.y / length);
    }
}

class Rectangle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    get vertices() {
        return [
        new Vector2(this.x, this.y),
        new Vector2(this.x + this.width, this.y),
        new Vector2(this.x + this.width, this.y + this.height),
        new Vector2(this.x, this.y + this.height)
        ];
    }

    set vertices(vertices) {
        this.x = vertices[0].x
        this.y = vertices[0].y
    }

    get top() {
        return this.y
    }

    get bottom() {
        return this.y + this.height
    }

    get left() {
        return this.x
    }

    get right() {
        return this.x + this.width
    }
}

class Polygon {
    constructor(vertices = []) {
        this.vertices = vertices
    }

    get aabb() {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const vertex of this.vertices) {
            minX = Math.min(minX, vertex.x);
            minY = Math.min(minY, vertex.y);
            maxX = Math.max(maxX, vertex.x);
            maxY = Math.max(maxY, vertex.y);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    get area() {
        let total = 0;
    
        for (let i = 0, l = this.vertices.length; i < l; i++) {
            const addX = this.vertices[i].x
            const addY = this.vertices[i == this.vertices.length - 1 ? 0 : i + 1].y
            const subX = this.vertices[i == this.vertices.length - 1 ? 0 : i + 1].x
            const subY = this.vertices[i].y
    
            total += (addX * addY * 0.5)
            total -= (subX * subY * 0.5)
        }
    
        return Math.abs(total)
    }

    get isRectangle() {
        return this.aabb.width * this.aabb.height === this.area
    }
}

/// narrow phase /////////////////

// check if the rectangle and the polygon are
// colliding using sat (separating axis theorem)
function detectCollision(rectangle, polygon) {
    // check if any vertex of the polygon is inside the rectangle
    for (var i = 0; i < polygon.vertices.length; i++) {
    var vertex = polygon.vertices[i];
    if (pointInRectangle(vertex, rectangle)) {
        return true;
    }
    }

    // check if any side of the polygon intersects the rectangle
    for (var i = 0; i < polygon.vertices.length; i++) {
    var p1 = polygon.vertices[i];
    var p2 = polygon.vertices[(i + 1) % polygon.vertices.length];
    var v1 = p2.subtract(p1);
    for (var j = 0; j < rectangle.vertices.length; j++) {
        var p3 = rectangle.vertices[j];
        var p4 = rectangle.vertices[(j + 1) % rectangle.vertices.length];
        var v2 = p4.subtract(p3);
        if (linesIntersect(p1, v1, p3, v2)) {
        return true;
        }
    }
    }

    return false;
}

// check if a point is inside a rectangle
function pointInRectangle(point, rectangle) {
    return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width &&
        point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height;
}

// check if two line segments intersect
function linesIntersect(p1, v1, p2, v2) {
    var denominator = v2.y * v1.x - v2.x * v1.y;

    // check if the lines are parallel
    if (denominator == 0) {
        return null;
    }

    var u = (v2.x * (p1.y - p2.y) - v2.y * (p1.x - p2.x)) / denominator;
    var t = (v1.x * (p1.y - p2.y) - v1.y * (p1.x - p2.x)) / denominator;

    // if both t and u are between 0 and 1, the line segments intersect
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// resolve collision using mtv (minimum translation vector)
function resolveCollision(rectangle, polygon) {
    // get the vertices of the rectangle
    const rectVertices = rectangle.vertices;
  
    // initialize the minimum translation vector to a large number
    let mtv = new Vector2(Number.MAX_VALUE, Number.MAX_VALUE);
  
    // iterate over the edges of the polygon
    for (let i = 0; i < polygon.vertices.length; i++) {
      const v1 = polygon.vertices[i];
      const v2 = polygon.vertices[(i + 1) % polygon.vertices.length];
  
      // calculate the normal of the edge
      const edge = v2.subtract(v1);
      const normal = new Vector2(-edge.y, edge.x).normalize();
  
      // project the vertices of the rectangle onto the normal
      let minRect = Number.MAX_VALUE;
      let maxRect = -Number.MAX_VALUE;
      for (const vertex of rectVertices) {
        const projection = normal.dot(vertex);
        minRect = Math.min(minRect, projection);
        maxRect = Math.max(maxRect, projection);
      }
  
      // project the vertices of the polygon onto the normal
      let minPoly = Number.MAX_VALUE;
      let maxPoly = -Number.MAX_VALUE;
      for (const vertex of polygon.vertices) {
        const projection = normal.dot(vertex);
        minPoly = Math.min(minPoly, projection);
        maxPoly = Math.max(maxPoly, projection);
      }
  
      // check if there is an intersection along this edge
      if (maxRect < minPoly || maxPoly < minRect) {
        // no intersection, the MTV is zero
        return new Vector2(0, 0);
      } else {
        // calculate the overlap and update the MTV if necessary
        const overlap = Math.min(maxRect, maxPoly) - Math.max(minRect, minPoly);
  
        // check if the rectangle is overlapping with the inside of the edge
        if (minRect < minPoly) {
          // negate the normal vector to reverse its direction
          normal.x *= -1;
          normal.y *= -1;
        }
  
        if (overlap < mtv.length) {
          mtv = normal.multiply(overlap);
        }
      }
    }
  
    // return the minimum translation vector
    return mtv;
}

/// broad phase //////////////////

// checks if two AABBs intersect
function checkAABBs(a, b) {
    return (
      a.x            <= b.x + b.width &&
      a.x + a.width  >= b.x &&
      a.y            <= b.y + b.height &&
      a.y + a.height >= b.y
    );
}

// performs broad phase collision detection using a swept AABB
function broadPhaseCollisionDetection(startPosition, endPosition, polygons) {
    // Calculate the AABB of the moving rectangle at the start and end of the frame
    const startAABB = new Rectangle(
        startPosition.x + PLAYER_COLLIDER_OFFSET,
        startPosition.y + PLAYER_COLLIDER_SIZE,
        PLAYER_COLLIDER_SIZE,
        PLAYER_COLLIDER_SIZE
    )
    const endAABB = new Rectangle(
        endPosition.x + PLAYER_COLLIDER_OFFSET,
        endPosition.y + PLAYER_COLLIDER_SIZE,
        PLAYER_COLLIDER_SIZE,
        PLAYER_COLLIDER_SIZE
    )
  
    // Check for collisions with the static polygons using the AABB
    for (const polygon of polygons) {
      if (checkAABBs(polygon.aabb, startAABB) || checkAABBs(polygon.aabb, endAABB)) {
        if (detectCollision(endAABB, polygon)) {
            const mtv = resolveCollision(endAABB, polygon)
            endPosition.x += mtv.x
            endPosition.y += mtv.y
        }
      }
    }
    
    return endPosition
}

//////////////////////////////////

module.exports = {
    Vector2,
    Rectangle,
    Polygon,
    checkAABBs,
    detectCollision,
    resolveCollision,
    broadPhaseCollisionDetection,
}
