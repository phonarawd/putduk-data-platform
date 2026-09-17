/** 기업·노드 필드를 핸드오프 6종 장면과 모션 메타데이터로 연결한다. */

export type MotionProfileName =
  | 'road_logistics'
  | 'air_cargo'
  | 'ocean_vessel'
  | 'warehouse_edge'
  | 'commerce_catalog'
  | 'satellite_network';

export type MotionDescriptor = {
  motion_profile: MotionProfileName;
  motion_version: string;
  scene_theme: string;
  vehicle_type: string;
  route_type: string;
  particle_style: string;
  completion_effect: string;
  scene: MotionProfileName;
  accent: string;
};

type CompanyPreset = MotionDescriptor & {
  aliases: string[];
};

const PRESETS: CompanyPreset[] = [
  {
    aliases: ['dhl'],
    motion_profile: 'road_logistics',
    motion_version: '2.0.0',
    scene_theme: 'dhl_amber',
    vehicle_type: 'delivery_van',
    route_type: 'city_route',
    particle_style: 'scan_pulse',
    completion_effect: 'gold_sync',
    scene: 'road_logistics',
    accent: '#ffcc00'
  },
  {
    aliases: ['ups'],
    motion_profile: 'road_logistics',
    motion_version: '2.0.0',
    scene_theme: 'ups_branch',
    vehicle_type: 'delivery_van',
    route_type: 'branch_route',
    particle_style: 'data_packet',
    completion_effect: 'gold_sync',
    scene: 'road_logistics',
    accent: '#64a70b'
  },
  {
    aliases: ['fedex'],
    motion_profile: 'air_cargo',
    motion_version: '2.0.0',
    scene_theme: 'fedex_purple',
    vehicle_type: 'aircraft',
    route_type: 'air_corridor',
    particle_style: 'document_chip',
    completion_effect: 'gold_sync',
    scene: 'air_cargo',
    accent: '#4d148c'
  },
  {
    aliases: ['maersk'],
    motion_profile: 'ocean_vessel',
    motion_version: '2.0.0',
    scene_theme: 'maersk_blue',
    vehicle_type: 'container_ship',
    route_type: 'ocean_lane',
    particle_style: 'wake_packet',
    completion_effect: 'gold_sync',
    scene: 'ocean_vessel',
    accent: '#42b0d5'
  },
  {
    aliases: ['alibaba', '알리바바'],
    motion_profile: 'commerce_catalog',
    motion_version: '2.0.0',
    scene_theme: 'alibaba_orange',
    vehicle_type: 'catalog_card',
    route_type: 'conveyor',
    particle_style: 'attribute_chip',
    completion_effect: 'gold_sync',
    scene: 'commerce_catalog',
    accent: '#ff6a00'
  },
  {
    aliases: ['ebay', '이베이'],
    motion_profile: 'commerce_catalog',
    motion_version: '2.0.0',
    scene_theme: 'ebay_field',
    vehicle_type: 'catalog_card',
    route_type: 'field_match',
    particle_style: 'attribute_chip',
    completion_effect: 'gold_sync',
    scene: 'commerce_catalog',
    accent: '#0064d2'
  },
  {
    aliases: ['cj', 'cj대한통운', '대한통운'],
    motion_profile: 'road_logistics',
    motion_version: '2.0.0',
    scene_theme: 'cj_red',
    vehicle_type: 'delivery_van',
    route_type: 'warehouse_scan',
    particle_style: 'scan_pulse',
    completion_effect: 'gold_sync',
    scene: 'road_logistics',
    accent: '#c8102e'
  },
  {
    aliases: ['gxo'],
    motion_profile: 'warehouse_edge',
    motion_version: '2.0.0',
    scene_theme: 'gxo_grid',
    vehicle_type: 'pallet',
    route_type: 'warehouse_grid',
    particle_style: 'stock_cell',
    completion_effect: 'gold_sync',
    scene: 'warehouse_edge',
    accent: '#0d9f76'
  }
];

const PROFILE_FALLBACK: Record<string, MotionProfileName> = {
  road: 'road_logistics',
  road_logistics: 'road_logistics',
  scan: 'road_logistics',
  route: 'road_logistics',
  air: 'air_cargo',
  air_cargo: 'air_cargo',
  document: 'air_cargo',
  ocean: 'ocean_vessel',
  ocean_vessel: 'ocean_vessel',
  warehouse: 'warehouse_edge',
  warehouse_edge: 'warehouse_edge',
  catalog: 'commerce_catalog',
  commerce_catalog: 'commerce_catalog',
  satellite: 'satellite_network',
  satellite_network: 'satellite_network',
  default: 'satellite_network'
};

const PROFILE_DEFAULTS: Record<MotionProfileName, Omit<MotionDescriptor, 'motion_profile' | 'scene'>> = {
  road_logistics: {
    motion_version: '2.0.0',
    scene_theme: 'city_amber',
    vehicle_type: 'delivery_van',
    route_type: 'city_route',
    particle_style: 'data_packet',
    completion_effect: 'gold_sync',
    accent: '#f3cd6b'
  },
  air_cargo: {
    motion_version: '2.0.0',
    scene_theme: 'air_violet',
    vehicle_type: 'aircraft',
    route_type: 'air_corridor',
    particle_style: 'document_chip',
    completion_effect: 'gold_sync',
    accent: '#b4aaff'
  },
  ocean_vessel: {
    motion_version: '2.0.0',
    scene_theme: 'ocean_teal',
    vehicle_type: 'container_ship',
    route_type: 'ocean_lane',
    particle_style: 'wake_packet',
    completion_effect: 'gold_sync',
    accent: '#78dce6'
  },
  warehouse_edge: {
    motion_version: '2.0.0',
    scene_theme: 'grid_mint',
    vehicle_type: 'pallet',
    route_type: 'warehouse_grid',
    particle_style: 'stock_cell',
    completion_effect: 'gold_sync',
    accent: '#80efc1'
  },
  commerce_catalog: {
    motion_version: '2.0.0',
    scene_theme: 'catalog_gold',
    vehicle_type: 'catalog_card',
    route_type: 'conveyor',
    particle_style: 'attribute_chip',
    completion_effect: 'gold_sync',
    accent: '#f3cd6b'
  },
  satellite_network: {
    motion_version: '2.0.0',
    scene_theme: 'sat_mint',
    vehicle_type: 'satellite',
    route_type: 'uplink',
    particle_style: 'data_packet',
    completion_effect: 'gold_sync',
    accent: '#0d9f76'
  }
};

export function resolveMotion(node: Record<string, unknown> | null | undefined): MotionDescriptor {
  const source = node || {};
  const haystack = [
    source.company,
    source.brand_name,
    source.partner_name,
    source.slug,
    source.name,
    source.title,
    source.title_ko
  ].map((value) => String(value || '').toLowerCase().replace(/\s+/g, ''));

  const matched = PRESETS.find((preset) =>
    preset.aliases.some((alias) => haystack.some((text) => text.includes(alias)))
  );

  const rawProfile = String(source.motion_profile || source.motion || matched?.motion_profile || 'default');
  const profile = PROFILE_FALLBACK[rawProfile] || matched?.motion_profile || 'satellite_network';
  const defaults = PROFILE_DEFAULTS[profile];

  return {
    motion_profile: profile,
    motion_version: String(source.motion_version || matched?.motion_version || defaults.motion_version),
    scene_theme: String(source.scene_theme || matched?.scene_theme || defaults.scene_theme),
    vehicle_type: String(source.vehicle_type || matched?.vehicle_type || defaults.vehicle_type),
    route_type: String(source.route_type || matched?.route_type || defaults.route_type),
    particle_style: String(source.particle_style || matched?.particle_style || defaults.particle_style),
    completion_effect: String(source.completion_effect || matched?.completion_effect || defaults.completion_effect),
    scene: profile,
    accent: String(source.color || matched?.accent || defaults.accent)
  };
}

export const MOTION_SCENES: MotionProfileName[] = [
  'road_logistics',
  'air_cargo',
  'ocean_vessel',
  'warehouse_edge',
  'commerce_catalog',
  'satellite_network'
];
