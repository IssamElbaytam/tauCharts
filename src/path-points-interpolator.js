import {utils} from './utils/utils';

export default function getPathPointsInterpolator(pointsFrom, pointsTo) {

    // TODO: Continue unfinished transition of ending points.
    pointsFrom = pointsFrom.filter(d => !d.isInterpolatedEnding);

    var getIntermediate;

    return (t) => {
        if (t === 0) {
            return pointsFrom;
        }
        if (t === 1) {
            return pointsTo;
        }

        if (!getIntermediate) {
            getIntermediate = createIntermediatePointsInterpolator(pointsFrom, pointsTo);
        }

        return getIntermediate(t);
    };
}

/**
 * Creates intermediate points array, so that the number of points
 * remains the same and added or excluded points are situated between
 * existing points.
 */
function createIntermediatePointsInterpolator(pointsFrom, pointsTo) {
    var intermediate = [];
    var remainingPoints = [];
    var changingPoints = [];

    // NOTE: Suppose data is already sorted by X.
    var idsFrom = pointsFrom.map(d => d.id);
    var idsTo = pointsTo.map(d => d.id);
    var remainingIds = idsFrom
        .filter(id => idsTo.indexOf(id) >= 0);

    //
    // Determine start and end scales difference to apply
    // to initial target position of newly added points
    // (or end position of deleted points)

    var toEndScale = getScaleDiffFn(pointsFrom, pointsTo);
    var toStartScale = getScaleDiffFn(pointsTo, pointsFrom);

    //
    // Determine, how to interpolate changes between remaining points

    var handleLeftSideChanges = (indexFrom, indexTo) => {
        var newCount = indexTo;

        var decreasing = newCount === 0;
        var targetEnding = (decreasing ?
            pointsFrom.slice(0, indexFrom + 1) :
            pointsTo.slice(0, indexTo + 1)
        );
        var toOppositeScale = (decreasing ?
            toEndScale :
            toStartScale
        );

        changingPoints.push({
            startIndex: 0,
            getPoints: (
                decreasing ?
                    (t) => {
                        var polyline = targetEnding.slice(0);
                        var interpolated = interpolateEnding({
                            t, polyline,
                            decreasing,
                            rightToLeft: !decreasing
                        });
                        var diffed = interpolated.map(toOppositeScale);
                        return interpolatePoints(interpolated, diffed, t);
                    } :
                    (t) => {
                        var polyline = targetEnding.slice(0);
                        var interpolated = interpolateEnding({
                            t, polyline,
                            decreasing,
                            rightToLeft: !decreasing
                        });
                        var diffed = interpolated.map(toOppositeScale);
                        return interpolatePoints(diffed, interpolated, t);
                    }
            )
        });
        push(intermediate, utils.range(targetEnding.length - 1).map(() => null));
    };

    var handleInnerChanges = (indexFrom, indexTo, prevIndexFrom, prevIndexTo) => {
        var oldCount = indexFrom - prevIndexFrom - 1;
        var newCount = indexTo - prevIndexTo - 1;

        var putChangingPoints = (
            smallPolyline,
            bigPolyline,
            reverse
        ) => {
            var filledPoly = fillSmallerPolyline({
                smallPolyline,
                bigPolyline
            });
            var biggerPoints = bigPolyline.slice(1, bigPolyline.length - 1);
            var smallerPoints = filledPoly.slice(1, filledPoly.length - 1);
            changingPoints.push({
                startIndex: intermediate.length,
                getPoints: (t) => {
                    var points = interpolatePoints(
                        smallerPoints,
                        biggerPoints,
                        (reverse ? 1 - t : t)
                    );
                    points.forEach(d => d.positionIsBeingChanged = true);
                    return points;
                }
            });
        };

        var polyFrom = pointsFrom.slice(indexFrom - oldCount - 1, indexFrom + 1);
        var polyTo = pointsTo.slice(indexTo - newCount - 1, indexTo + 1);
        if (newCount > oldCount) {
            putChangingPoints(polyFrom, polyTo, false);
        } else if (oldCount > newCount) {
            putChangingPoints(polyTo, polyFrom, true);
        } else if (oldCount > 0) {
            changingPoints.push({
                startIndex: intermediate.length,
                getPoints: (t) => {
                    var points = interpolatePoints(
                        pointsFrom.slice(
                            indexFrom - oldCount,
                            indexFrom
                        ),
                        pointsTo.slice(
                            indexTo - newCount,
                            indexTo
                        ),
                        t
                    );
                    points.forEach(d => d.positionIsBeingChanged = true);
                    return points;
                }
            });
        }
        push(intermediate, utils.range(Math.max(newCount, oldCount)).map(() => null));
    };

    var handleRightSideChanges = (indexFrom, indexTo) => {
        var newCount = pointsTo.length - indexTo - 1;

        var decreasing = newCount === 0;
        var targetEnding = (decreasing ?
            pointsFrom.slice(indexFrom) :
            pointsTo.slice(indexTo)
        );
        var toOppositeScale = (decreasing ?
            toEndScale :
            toStartScale
        );

        changingPoints.push({
            startIndex: intermediate.length,
            getPoints: (
                decreasing ?
                    (t) => {
                        var polyline = targetEnding.slice(0);
                        var interpolated = interpolateEnding({
                            t, polyline,
                            decreasing,
                            rightToLeft: decreasing
                        });
                        var diffed = interpolated.map(toOppositeScale);
                        return interpolatePoints(interpolated, diffed, t);
                    } :
                    (t) => {
                        var polyline = targetEnding.slice(0);
                        var interpolated = interpolateEnding({
                            t, polyline,
                            decreasing,
                            rightToLeft: decreasing
                        });
                        var diffed = interpolated.map(toOppositeScale);
                        return interpolatePoints(diffed, interpolated, t);
                    }
            )
        });
        push(intermediate, utils.range(targetEnding.length - 1).map(() => null));
    };

    var handleNewlyCreatedPath = () => {
        intermediate.push(pointsTo[0]);
        push(intermediate, utils.range(pointsTo.length - 1).map(() => null));
        var polyline = pointsTo.slice(0);
        changingPoints.push({
            startIndex: 1,
            getPoints: (t) => {
                return interpolateEnding({t, polyline, decreasing: false});
            }
        });
    };

    var handleRemovingPath = () => {
        intermediate.push(pointsFrom[0]);
        push(intermediate, utils.range(pointsFrom.length - 1).map(() => null));
        var polyline = pointsFrom.slice(0);
        changingPoints.push({
            startIndex: 1,
            getPoints: (t) => {
                return interpolateEnding({t, polyline, decreasing: true, rightToLeft: true});
            }
        });
    };

    remainingIds.forEach((id, i) => {

        var indexFrom = idsFrom.indexOf(id);
        var indexTo = idsTo.indexOf(id);

        if (
            i === 0 &&
            (indexFrom > 0 || indexTo > 0)
        ) {
            handleLeftSideChanges(indexFrom, indexTo);
        }

        if (i > 0) {
            handleInnerChanges(
                indexFrom,
                indexTo,
                idsFrom.indexOf(remainingIds[i - 1]),
                idsTo.indexOf(remainingIds[i - 1])
            );
        }

        remainingPoints.push({
            index: intermediate.length,
            getPoint: (t) => {
                return interpolatePoint(pointsFrom[indexFrom], pointsTo[indexTo], t);
            }
        });
        intermediate.push(null);

        if (
            i === remainingIds.length - 1 &&
            (pointsFrom.length - indexFrom - 1 > 0 ||
                pointsTo.length - indexTo - 1)
        ) {
            handleRightSideChanges(indexFrom, indexTo);
        }
    });

    if (changingPoints.length === 0) {
        if (pointsTo.length > 0 && remainingIds.length === 0) {
            handleNewlyCreatedPath();
        } else if (pointsFrom.length > 0 && remainingIds.length === 0) {
            handleRemovingPath();
        }
    }

    var updateIntermediatePoints = (t) => {
        remainingPoints.forEach((d) => {
            var pt = d.getPoint(t);
            intermediate[d.index] = pt;
        });
        changingPoints.forEach((d) => {
            var points = d.getPoints(t);
            points.forEach((pt, i) => intermediate[d.startIndex + i] = pt);
        });
    };

    return (t) => {
        updateIntermediatePoints(t);
        return intermediate;
    };
}

function push(target, items) {
    return Array.prototype.push.apply(target, items);
}

function interpolateValue(a, b, t) {
    if (typeof b === 'number') {
        return (a + t * (b - a));
    }
    return b;
}

function interpolatePoint(a, b, t) {
    if (a === b) {
        return b;
    }
    var c = {};
    var props = utils.unique(Object.keys(a), Object.keys(b));
    props.forEach((k) => c[k] = interpolateValue(a[k], b[k], t));
    c.id = a.id;
    return c;
}

function interpolatePoints(pointsFrom, pointsTo, t) {
    var result = pointsFrom.map((a, i) => interpolatePoint(a, pointsTo[i], t));
    return result;
}

/**
 * Returns a polyline with points that move along line
 * from start point to full line (or vice versa).
 */
function interpolateEnding({t, polyline, decreasing, rightToLeft}) {

    var reverse = Boolean(decreasing) !== Boolean(rightToLeft);

    var result = (function getLinePiece(t, line) {
        var q = 0;
        if (t > 0) {
            var distance = [0];
            var totalDistance = 0;
            for (var i = 1, x, y, x0, y0, d; i < line.length; i++) {
                x0 = line[i - 1].x;
                y0 = line[i - 1].y;
                x = line[i].x;
                y = line[i].y;
                d = Math.sqrt((x - x0) * (x - x0) + (y - y0) * (y - y0));
                totalDistance += d;
                distance.push(totalDistance);
            }
            var passedDistance = t * totalDistance;
            for (i = 1; i < distance.length; i++) {
                if (passedDistance === distance[i]) {
                    q = (i / (line.length - 1));
                    break;
                }
                if (passedDistance < distance[i]) {
                    q = Math.min(1, (i - 1 +
                        (passedDistance - distance[i - 1]) /
                        (distance[i] - distance[i - 1])) /
                        (line.length - 1)
                    );
                    break;
                }
            }
        }

        var existingCount = Math.floor((line.length - 1) * q) + 1;
        var tempCount = line.length - existingCount;
        var tempStartIdIndex = existingCount;
        var result = line.slice(0, existingCount);
        if (q < 1) {
            var qi = (q * (line.length - 1)) % 1;
            var midPt = interpolatePoint(
                line[existingCount - 1],
                line[existingCount],
                qi
            );
            push(result, utils.range(tempCount).map((i) => Object.assign(
                {}, midPt,
                {
                    id: line[tempStartIdIndex + i].id,
                    positionIsBeingChanged: true,
                    isInterpolatedEnding: true
                }
            )));
        }
        return result.slice(1);
    })(
        (decreasing ? 1 - t : t),
        (reverse ? polyline.slice(0).reverse() : polyline)
    );
    if (reverse) {
        result.reverse();
    }

    return result;
}

/**
 * Returns a polyline, filled with points, so that number of points
 * becomes the same on both start and end polylines.
 */
function fillSmallerPolyline({smallPolyline, bigPolyline}) {

    var segmentsCount = {
        small: smallPolyline.length - 1,
        big: bigPolyline.length - 1
    };
    var minSegmentPointsCount = Math.floor(segmentsCount.big / segmentsCount.small) + 1;
    var restPointsCount = segmentsCount.big % segmentsCount.small;
    var segmentsPointsCount = utils.range(segmentsCount.small)
        .map(i => (minSegmentPointsCount + Number(i < restPointsCount)));

    var result = [smallPolyline[0]];
    var smallPtIndex = 1;
    segmentsPointsCount.forEach((segPtCount) => {
        utils.range(1, segPtCount).forEach(i => {
            if (i === segPtCount - 1) {
                result.push(smallPolyline[smallPtIndex]);
            } else {
                var newPt = interpolatePoint(
                    smallPolyline[smallPtIndex - 1],
                    smallPolyline[smallPtIndex],
                    (i / (segPtCount - 1))
                );
                newPt.positionIsBeingChanged = true;
                newPt.id = bigPolyline[result.length].id;
                result.push(newPt);
            }
        });
        smallPtIndex++;
    });

    return result;
}

/**
 * Returns a function which moves a point from it's scale
 * to opposite scale (e.g. from start scale to end scale).
 */
function getScaleDiffFn(points1, points2) {

    // Find remaining points with predictable position
    var src = [];
    var dst = [];
    var i, j, a, b, matchJ = 0;
    var len1 = points1.length;
    var len2 = points2.length;
    for (i = 0; i < len1; i++) {
        a = points1[i];
        for (j = matchJ; j < len2; j++) {
            b = points2[j];
            if (a.id === b.id) {
                if (
                    !a.positionIsBeingChanged &&
                    !b.positionIsBeingChanged
                ) {
                    matchJ = j + 1;
                    src.push(a);
                    dst.push(b);
                }
                break;
            }
        }
    }

    if (src.length < 1 || dst.length < 1) {
        // Applying scale difference will not be possible
        return (d => d);
    }

    var numProps = Object.keys(src[0])
        .filter(prop => typeof src[0][prop] === 'number')
        .filter(prop => prop !== 'id');

    var propDiffs = {};
    var createPropDiffFn = (a, b, A, B) => (c) => (
        B +
        (c - b) *
        (B - A) /
        (b - a)
    );
    var createSimpleDiffFn = (a, A) => (c) => (c - a + A);
    numProps.forEach(prop => {
        var a = src[0][prop];
        var A = dst[0][prop];
        for (var i = src.length - 1, b, B; i > 0; i--) {
            b = src[i][prop];
            if (b !== a) {
                B = dst[i][prop];
                propDiffs[prop] = createPropDiffFn(a, b, A, B);
                return;
            }
        }
        propDiffs[prop] = createSimpleDiffFn(a, A);
    });

    return (c) => {
        var C = Object.assign({}, c);
        numProps.forEach(p => {
            C[p] = propDiffs[p](c[p]);
        });
        return C;
    };
}