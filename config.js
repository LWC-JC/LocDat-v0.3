// ===== LocDat configuration (from Configuration.xlsx) =====
const APP_VERSION = '0.5.4';
const APP_STAGE = 'Beta';
const AUTH_CONFIG_URL = 'https://gist.githubusercontent.com/LWC-JC/5d9ec7b11578ed9007c22dfa5a54c508/raw/locdat-auth.json';
const AUTH_CACHE_DAYS = 7;

const LITH_CONFIG = {
  majorConstituents: ['CLAY', 'SILT', 'SAND', 'GRAVEL', 'COBBLE'],
  minorConstituents: ['', 'Clayey', 'Silty', 'Sandy', 'Gravelly', 'Cobbled'],
  grainSize: ['', 'Fine', 'Fine-medium', 'Medium', 'Medium-course', 'Course'],
  plasticity: ['', 'Non-plastic', 'Low', 'Low-medium', 'Medium', 'Medium-high', 'High'],
  primaryColour:   ['', 'Brown', 'Red', 'Orange', 'Yellow', 'White', 'Black', 'Grey', 'Green'],
  combination: ['', '-', 'Mottled'],
  secondaryColour: ['', 'Brown', 'Red', 'Orange', 'Yellow', 'White', 'Black', 'Grey', 'Green'],
  colourShade: ['', 'Light', 'Dark'],
  moisture: ['', 'Dry', 'dry-moist', 'Moist', 'Moist-wet', 'Wet'],
  consistencyCohesive: ['', 'Very soft', 'Soft', 'Firm', 'Stiff', 'Very stiff', 'Hard'],
  consistencyNonCohesive: ['', 'Very loose', 'Loose', 'Medium dense', 'Dense', 'Very Dense'],
  grading: ['', 'Well', 'Poorly', 'Gap', 'Uniform'],
  particleShape: ['', 'Rounded', 'Sub-rounded', 'Sub-angular', 'Angular'],
  inclusions: ['', 'Brick fragments', 'Asphalt fragments', 'Concrete fragments', 'Ash', 'Slag', 'Black speck inclusions', 'potentially asbestos cement sheeting', 'Metal fragments', 'Glass fragments', 'Timber fragments', 'Plastic fragments', 'Wood fragments'],
  inclusionAmount: ['', 'Trace', 'With'],
  odour:   ['', 'Hydrocarbon', 'Organic', 'Sulfur', 'Chemical', 'Other', 'No odour'],
  staining: ['', 'Dark', 'Light']
};

const SAMPLE_TYPES    = ['Normal', 'Field_D', 'Interlab_D', 'Rinse', 'Trip Blank'];
const SAMPLE_MATRIX   = ['Soil', 'Water', 'Gas', 'Other'];
const SAMPLE_CONTAINERS = ['Jar', 'Clear vial', 'Amber bottle', 'PFAS-free', 'Bag'];
const SAMPLE_METHODS_SOIL  = ['', 'Grab Sample', 'Core Sample', 'Auger cutting sample', 'Other'];
const SAMPLE_METHODS_GW    = ['', 'Micro-purge pump', 'Peristaltic pump', 'Bailer', 'Other'];
const SAMPLE_METHODS_SV    = ['', 'Summa canister', 'Radiello', 'Waterloo', 'Other'];
const SAMPLE_METHODS_OTHER = SAMPLE_METHODS_SOIL;
const SAMPLE_METHODS = SAMPLE_METHODS_SOIL; // legacy fallback

const COC_LAB_ROLES   = ['Primary', 'Secondary'];
const COC_QC_TYPES    = ['RINSE', 'TB', 'TS'];
const COC_QC_LABELS   = { RINSE: 'Equipment Rinse', TB: 'Trip Blank', TS: 'Trip Spike' };

const WP_EC_UNITS      = ['μS/cm', 'mS/cm'];
const WP_DO_UNITS      = ['ppm', '%'];
const WP_ODOUR         = ['', 'Hydrocarbon', 'Organic', 'Sweet', 'Other'];
const WP_SHEEN         = ['No', 'Yes'];
const WP_TURBIDITY     = ['None', 'Low', 'Moderate', 'High'];

const MEASUREMENT_CONFIG = {
  types: ['', 'PID', 'RemScan'],
  units: ['', 'ppm', 'mg/kg']
};

// Default settings
const DEFAULT_SETTINGS = {
  userName: '',
  autoIds: {
    locationPrefix:       'Loc-',
    soilBorePrefix:       'SB',
    soilBoreSamplePrefix: '[SoilBoreId]_[from]-[to]',
    soilSamplePrefix:     'SS',
    gwSamplePrefix:       'GW',
    svSamplePrefix:       'SV',
    otherSamplePrefix:    'OS'
  },
  cocDefaults: {
    dispatchContactName:  '',
    dispatchContactPhone: '',
    dispatchContactEmail: '',
    resultsEmail1:        '',
    resultsEmail2:        ''
  },
  customAttrGroup: {
    name: 'CUSTOM1',
    attr1Name: '', attr1Units: '',
    attr2Name: '', attr2Units: '',
    attr3Name: '', attr3Units: ''
  }
};

const FILL_NATURAL_OPTIONS = ['', 'Fill', 'Natural', 'Re-worked Natural'];

// Attribute group types that can be added to a Location
const ATTR_GROUPS = [
  { key: 'soilBorehole',     name: 'Soil Bore',                multi: true },
  { key: 'soilSample',       name: 'Soil Sample',              multi: true },
  { key: 'gwSample',         name: 'Water Sample',             multi: true },
  { key: 'svSample',         name: 'Soil Vapour Sample',       multi: true },
  { key: 'otherSample',      name: 'Other Sample',             multi: true },
  { key: 'waterParams',      name: 'Water Parameters',         multi: false },
  { key: 'gwWellGauge',      name: 'Groundwater Well Gauge',   multi: true },
  { key: 'fieldMeasurement', name: 'Field Measurement',        multi: true },
  { key: 'custom1',          name: 'Custom 1',                 multi: true }
];
