export interface PlantFieldDef {
  key: string;
  label: string;
  requiredInTable?: boolean;
  defaultVisible?: boolean;
  sortable?: boolean;
  isLongText?: boolean; // For truncation
}

export const PLANT_FIELD_DEFS: PlantFieldDef[] = [
  {
    key: "thumbnail",
    label: "Thumbnail",
    requiredInTable: true,
    defaultVisible: true,
    sortable: false,
  },
  {
    key: "name",
    label: "Name",
    requiredInTable: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    key: "scientific_name",
    label: "Scientific Name",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
  },
  {
    key: "category",
    label: "Category",
    requiredInTable: false,
    defaultVisible: true,
    sortable: true,
  },
  {
    key: "light",
    label: "Light",
    requiredInTable: false,
    defaultVisible: true,
    sortable: true,
  },
  {
    key: "watering_requirement",
    label: "Watering",
    requiredInTable: false,
    defaultVisible: true,
    sortable: false,
    isLongText: true,
  },
  {
    key: "price_band",
    label: "Price Band",
    requiredInTable: false,
    defaultVisible: true,
    sortable: false,
  },
  {
    key: "fertilization_requirement",
    label: "Fertilization",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
    isLongText: true,
  },
  {
    key: "soil_mix",
    label: "Soil Mix",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
    isLongText: true,
  },
  {
    key: "toxicity",
    label: "Toxicity",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
  },
  {
    key: "lifespan",
    label: "Lifespan",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
  },
  {
    key: "horticulturist_notes",
    label: "Horticulturist Notes",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
    isLongText: true,
  },
  {
    key: "published",
    label: "Published",
    requiredInTable: false,
    defaultVisible: true,
    sortable: true,
  },
  {
    key: "has_image",
    label: "Has Image",
    requiredInTable: false,
    defaultVisible: false,
    sortable: false,
  },
  {
    key: "updated_at",
    label: "Updated",
    requiredInTable: false,
    defaultVisible: true,
    sortable: true,
  },
  {
    key: "created_at",
    label: "Created",
    requiredInTable: false,
    defaultVisible: false,
    sortable: true,
  },
  {
    key: "actions",
    label: "Actions",
    requiredInTable: true,
    defaultVisible: true,
    sortable: false,
  },
];

// Default visible columns (current minimal set)
export const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  thumbnail: true,
  name: true,
  category: true,
  light: true,
  watering_requirement: true,
  price_band: true,
  published: true,
  updated_at: true,
  actions: true,
};

// Initialize all columns with defaults
export const INITIAL_VISIBLE_COLUMNS: Record<string, boolean> = PLANT_FIELD_DEFS.reduce(
  (acc, field) => {
    acc[field.key] = field.defaultVisible ?? false;
    return acc;
  },
  {} as Record<string, boolean>
);
