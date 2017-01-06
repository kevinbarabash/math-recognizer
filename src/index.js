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

const thickness = 10;
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


strokes.onValue((stroke) => {
    const angles = calcAngles(stroke);
    const anglesNoDiscont = removeDiscontinuities(angles);

    const bounds = calcBounds(stroke);
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
    console.log(directions);

    // TODO get the magnitude of the direction changes... if there aren't any
    // big changes then it's probably a straight line
    // what about the deviation from the norm... if it's low... that will also indicate a straight line


    // A bimodal distribution indicates some sort of angular stroke

    console.log('%o', anglesNoDiscont);


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
