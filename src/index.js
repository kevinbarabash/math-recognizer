const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

ctx.translate(0, canvas.height);
ctx.scale(1, -1);

CanvasRenderingContext2D.prototype.fillCircle = (x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.fill()
};

CanvasRenderingContext2D.prototype.strokeLine = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

const eventToPoint = (e) => ({x: e.pageX, y: canvas.height - e.pageY});

const moves = Kefir.fromEvents(document, 'mousemove').map(eventToPoint);
const ups = Kefir.fromEvents(document, 'mouseup').map(eventToPoint);
const downs = Kefir.fromEvents(document, 'mousedown').map(eventToPoint);

const drags = downs.flatMap((down) => {
    // TODO: check if down in the 'zone'
    return moves.takeUntilBy(ups);
});
const nextDrags = drags.skip(1);
const dragPairs = Kefir.zip([drags, nextDrags]);

const thickness = 2;
const radius = thickness / 2;

// dragPairs.observe((pair) => console.log(pair));

let prevP;
downs.onValue((p) => {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';

    ctx.fillCircle(p.x, p.y, radius);
    prevP = p;
});
drags.onValue((p) => {
    ctx.strokeLine(prevP.x, prevP.y, p.x, p.y);
    prevP = p;
});

const strokes = Kefir.stream((emitter) => {
    downs.onValue((p) => {
        const stroke = [p];

        // TODO: figure out how to include the up point
        moves.takeUntilBy(ups).observe({
            value: (p) => stroke.push(p),
            error: () => {},
            end: () => emitter.emit(stroke),
        });
    });
});

const calcAngles = (points) => {
    const angles = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        const angle = Math.atan2(dy, dx);
        angles.push(angle);
    }
    return angles;
}

const removeDiscontinuities = (angles) => {
    const result = [];
    let correction = 0;
    for (let i = 0; i < angles.length - 1; i++) {
        const a1 = angles[i] + correction;
        const a2 = angles[i+1] + correction;
        if (Math.abs(a2 - a1) > Math.PI) {
            correction += Math.sign(a1 - a2) * 2 * Math.PI;
            result.push(a1);
        } else {
            result.push(angles[i] + correction);
        }
    }
    result.push(angles[angles.length - 1] + correction);
    return result;
}


const statDirection = (numbers) => {

    let incs = 0;
    let decs = 0;
    for (let i = 0; i < numbers.length - 1; i++) {
        const n1 = numbers[i];
        const n2 = numbers[i+1];
        if (n2 > n1) {
            incs++;
        } else if (n2 < n1) {
            decs++;
        }
    }

    return {
        incs: incs,
        decs: decs,
    };
}

const calcBounds = (points) => points.reduce((accum, p) => {
    return {
        xMin: Math.min(accum.xMin, p.x),
        yMin: Math.min(accum.yMin, p.y),
        xMax: Math.max(accum.xMax, p.x),
        yMax: Math.max(accum.yMax, p.y),
    };
}, {
    xMin: Infinity,
    yMin: Infinity,
    xMax: -Infinity,
    yMax: -Infinity,
});

const dot = (u, v) => u.x * v.x + u.y * v.y;

const mag = (v) => Math.sqrt(dot(v, v));

const calcCurvature = (points) => {
    const results = [];

    for (let i = 0; i < points.length - 2; i++) {
        const a = points[i+0];
        const b = points[i+1];
        const c = points[i+2];

        const A = 0.5 * ((a.x - c.x) * (b.y - a.y) - (a.x - b.x) * (c.y - a.y));
        const K = 4 * A / (distance(a, b) * distance(b, c) * distance(c, a));

        if (K !== 0) {
            console.log(1 / K);
        }

        results.push(K);
    }

    return results;
}


const distance = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}


const mapPairs = (values, callback) => {
    const results = [];
    for (let i = 0; i < values.length - 1; i++) {
        results.push(callback(values[i], values[i + 1]));
    }
    return results;
}

const reducePairs = (values, callback, init) => {
    let result = init;
    for (let i = 0; i < values.length - 1; i++) {
        result = callback(result, values[i], values[i + 1]);
    }
    return result;
}

// TODO(kevinb) rename to arcLength?
const strokeLength = (points) =>
    reducePairs(points, (result, p1, p2) => result + distance(p1, p2), 0);

const calcDeltas = (scalars) => mapPairs(scalars, (k1, k2) => k2 - k1);

const add = (a, b) => a + b;

const sum = (xs) => xs.reduce(add);

const mean = (xs) => sum(xs) / xs.length;

const square = (a) => a * a;

const variance = (xs) => {
    const mu = mean(xs);
    return sum(xs.map(x => square(x - mu))) / xs.length;
}

const stddev = (xs) => Math.sqrt(variance(xs));

// A queue of strokes that are currently being evaluated
const recognizing = [];

// Each stroke should be giving a set of features/properties and the confidence in those features
// e.g.
// straight line
// - angle (implies direction as well)
// vertical (this can be determined from angle)
// - ascending/descending
// horizontal
// - left/right
// ...

// Detecting straight lines
// weight average of slopes
// calc stddev... if any point is a certain distance from the line segment than it's no longer straight

const possibleGlyphs = [];

// Strokes or groups of strokes that have been recognized as glyphs
const recognized = [];


strokes.onValue((points) => {
    const bounds = calcBounds(points);

    const w = bounds.xMax - bounds.xMin;
    const h = bounds.yMax - bounds.yMin;

    if (w > h) {
        console.log('horizontal');
        console.log(`h / w = ${h / w}`);

        const ratio = h / w;

        // each feature has some sort of probabbility
        // the range is from 0 to 0.5
        // between 0 and 0.05 it's 100%
        // after 0.25 it's 100% not
        let prob = 1.0;
        if (ratio > 0.25) {
            prob = 0.0;
        } else if (ratio > 0.05) {
            prob = 1.0 - (ratio - 0.05) / 0.2;
        }

        console.log(`prob = ${prob}`);
    } else {
        console.log('vertical');
        console.log(`w / h = ${w / h}`);

        const ratio = w / h;

        // each feature has some sort of probabbility
        // the range is from 0 to 0.5
        // between 0 and 0.05 it's 100%
        // after 0.25 it's 100% not
        let prob = 1.0;
        if (ratio > 0.25) {
            prob = 0.0;
        } else if (ratio > 0.05) {
            prob = 1.0 - (ratio - 0.05) / 0.2;
        }

        console.log(`prob = ${prob}`);
    }


    // const ks = calcCurvature(points);
    // console.log('curvatures: %o', ks);

    // const length = strokeLength(points);
    // console.log(`strokeLength = ${length}`);

    const angles = calcAngles(points);
    const anglesNoDiscont = removeDiscontinuities(angles).map((angle) => angle.toFixed(1));

    // console.log(anglesNoDiscont);

    const angleDeltas = calcDeltas(angles);
    // console.log('angleDeltas: %o', angleDeltas);

    // console.log(`mean = ${mean(angleDeltas)}`);
    // console.log(`variance = ${variance(angleDeltas)}`);
    // console.log(`stddev = ${stddev(angleDeltas)}`);
    // console.log('');

    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    ctx.strokeRect(bounds.xMin, bounds.yMin, bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);

    // compute curvature by looking at adjacent angles (slopes)

    // get the bounds of the stroke
    // look at the aspect ratio... 1 more narrow that the rest of the digits

    // Are there points near the middles of each of the sides?

    // How linear is the change in angles?

    // disregard points/angles near the ends... the start/stop of a stroke is jittery

    // TODO get the distance covered by the dissenting direction and compare
    // that aginst the distance covered by the majority direction
    const directions = statDirection(anglesNoDiscont);
    // console.log('directions: %o', directions);

    // TODO get the magnitude of the direction changes... if there aren't any
    // big changes then it's probably a straight line
    // what about the deviation from the norm... if it's low... that will also indicate a straight line


    // A bimodal distribution indicates some sort of angular stroke

    // console.log('anglesNoDiscont: %o', anglesNoDiscont);


    // start with detect staight lines
    // intersecting straight lines
    // detecting "sharp" corners, e.g. 60 - 120 degrees
    // take the derivative of the slope (angle) which gives the curvature (roughly)
    // and then find all of the changes that are greater than a certain threshold, e.g. spikes/outliers
    // these represent direction changes
    // need to determine the length of each straight section so that we can ignore sections that
    // are significantly smaller than the glyph's bounding box

    // combining strokes into characters

    // order of recognition
    // 1
    // -
    // +
    // times (cross)
    // =
    // 7
    // 4
    // 0
    // 6
    // 9
    // 8
    // 3
    // times (dot)
    // parentheses

    // feature detection => glyph detection
    // - (minus or + or = or t) if we detect a feature that's neither a short
    // vertical stroke crossing in the middle that or a stroke underneath or a
    // long vertical stroke, then we can assume we've detected a minus sign.
    // it could also be a fraction if someone puts a number above it... need to
    // be aware of context.

    // eventually avoid combining additional strokes to allready determined characters


    // TODO: analysis
});
