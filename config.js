// ===== LocDat configuration (from Configuration.xlsx) =====
const APP_VERSION = '0.3.6';
const APP_STAGE = 'Beta';
const AUTH_CONFIG_URL = 'https://gist.githubusercontent.com/LWC-JC/5d9ec7b11578ed9007c22dfa5a54c508/raw/241b3d3795e0e722d289b4df721b4c78324360c2/locdat-auth.json';
const AUTH_CACHE_DAYS = 7;

const LITH_CONFIG = {
  majorConstituents: ['CLAY', 'SILT', 'SAND', 'GRAVEL', 'COBBLE'],
  minorConstituents: ['', 'Clayey', 'Silty', 'Sandy', 'Gravelly', 'Cobbled'],
  grainSize: ['', 'Fine', 'Fine-medium', 'Medium', 'Medium-course', 'Course'],
  plasticity: ['', 'Non-plastic', 'Low', 'Low-medium', 'Medium', 'Medium-high', 'High'],
  primaryColour: ['', 'Brown', 'Red', 'Orange', 'Grey', 'Other - Black', 'Other - White', 'Other - Yellow', 'Other - Green', 'Other - Blue'],
  combination: ['', '-', 'Mottled'],
  secondaryColour: ['', 'Brown', 'Red', 'Orange', 'Grey', 'Other - Black', 'Other - White', 'Other - Yellow', 'Other - Green', 'Other - Blue'],
  colourShade: ['', 'Light', 'Dark'],
  moisture: ['', 'Dry', 'dry-moist', 'Moist', 'Moist-wet', 'Wet'],
  consistencyCohesive: ['', 'Very soft', 'Soft', 'Firm', 'Stiff', 'Very stiff', 'Hard'],
  consistencyNonCohesive: ['', 'Very loose', 'Loose', 'Medium dense', 'Dense', 'Very Dense'],
  grading: ['', 'Well', 'Poorly', 'Gap', 'Uniform'],
  particleShape: ['', 'Rounded', 'Sub-rounded', 'Sub-angular', 'Angular'],
  inclusions: ['', 'Brick fragments', 'Asphalt fragments', 'Concrete fragments', 'Ash', 'Slag', 'Black speck inclusions', 'potentially asbestos cement sheeting', 'Metal fragments', 'Glass fragments', 'Timber fragments', 'Plastic fragments', 'Wood fragments'],
  inclusionAmount: ['', 'Trace', 'With']
};

const SAMPLE_TYPES = ['Normal', 'Field_D', 'Interlab_D', 'Rinse', 'Trip Blank'];
const SAMPLE_METHODS_SOIL = ['', 'Grab Sample', 'Core Sample', 'Auger cutting sample', 'Other'];
const SAMPLE_METHODS_GW = ['', 'Micro-purge pump', 'Peristaltic pump', 'Bailer', 'Other'];
const SAMPLE_METHODS_SV = ['', 'Summa canister', 'Radiello', 'Waterloo', 'Other'];
const SAMPLE_METHODS = SAMPLE_METHODS_SOIL; // legacy fallback

const MEASUREMENT_CONFIG = {
  types: ['', 'PID', 'RemScan'],
  units: ['', 'ppm', 'mg/kg']
};

// Default settings
const DEFAULT_SETTINGS = {
  userName: '',
  autoIds: {
    locationPrefix: 'Loc-',
    soilBorePrefix: 'SB',
    soilBoreSamplePrefix: '[SoilBoreId]-',
    soilSamplePrefix: 'SS',
    gwSamplePrefix: 'GW',
    svSamplePrefix: 'SV'
  },
  customAttrGroup: {
    name: 'CUSTOM1',
    attr1Name: '',
    attr1Units: '',
    attr2Name: '',
    attr2Units: '',
    attr3Name: '',
    attr3Units: ''
  }
};

const FILL_NATURAL_OPTIONS = ['', 'Fill', 'Natural', 'Re-worked Natural'];

// Attribute group types that can be added to a Location
const ATTR_GROUPS = [
  { key: 'soilBorehole', name: 'Soil Bore', multi: true },
  { key: 'soilSample', name: 'Soil Sample', multi: true },
  { key: 'gwSample', name: 'Groundwater Sample', multi: true },
  { key: 'svSample', name: 'Soil Vapour Sample', multi: true },
  { key: 'gwWellGauge', name: 'Groundwater Well Gauge', multi: true },
  { key: 'fieldMeasurement', name: 'Field Measurement', multi: true },
  { key: 'custom1', name: 'Custom 1', multi: true }
];
