import {TauChartError as Error, errorCodes} from './error';

var UnitsMap = {};
var SeedsMap = {};

var unitsRegistry = {

    reg(unitType, xUnit, xSeed) {

        if (xSeed) {
            SeedsMap[unitType] = xSeed;
            UnitsMap[unitType] = function (config, Base) {
                this.___tauchartsseed___ = new Base(this.setup(config));
            };
            UnitsMap[unitType].prototype = Object.assign(
                {
                    setup(config) {
                        return config;
                    },
                    node() {
                        return this.___tauchartsseed___;
                    },
                    init() {
                        this.node().init();
                    },
                    draw() {
                        this.node().draw();
                    }
                },
                xUnit);
        } else {
            UnitsMap[unitType] = xUnit;
        }
        return this;
    },

    get(unitType) {

        if (!UnitsMap.hasOwnProperty(unitType)) {
            throw new Error('Unknown unit type: ' + unitType, errorCodes.UNKNOWN_UNIT_TYPE);
        }

        return UnitsMap[unitType];
    },

    create(unitType, unitConfig) {
        var Unit = this.get(unitType);
        var node;
        if (SeedsMap[unitType]) {
            var Base = this.get(SeedsMap[unitType]);
            node = new Unit(unitConfig, Base);
        } else {
            node = new Unit(unitConfig);
        }

        return node;
    }
};

export {unitsRegistry};