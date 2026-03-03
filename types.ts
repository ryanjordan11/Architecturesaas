
export enum ProductType {
  WEBSITE = 'Website',
  WEB_APP = 'Web App',
  HYBRID = 'Hybrid'
}

export enum OwnerRole {
  FOUNDER = 'Founder',
  CLIENT = 'Client',
  TEAM = 'Team',
  OTHER = 'Other'
}

export enum DeviceType {
  DESKTOP = 'Desktop',
  MOBILE = 'Mobile',
  BOTH = 'Both'
}

export enum Timeframe {
  T30D = '30d',
  T90D = '90d',
  T6M = '6m'
}

export enum ContentOwner {
  USER = 'User',
  ADMIN = 'Admin',
  AI = 'AI'
}

export enum FieldType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ENUM = 'enum',
  RELATION = 'relation',
  FILE = 'file'
}

export enum Visibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public'
}

export enum RetentionPolicy {
  PERMANENT = 'permanent',
  TIMED = 'timed',
  USER_DELETE = 'user-delete'
}

export enum DataDirection {
  IN = 'in',
  OUT = 'out',
  BOTH = 'both'
}

export enum IntegrationFailureBehavior {
  BLOCK = 'block',
  DEGRADE = 'degrade',
  QUEUE = 'queue'
}

export enum BackupFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  HOURLY = 'hourly'
}

export enum FailureSystem {
  AUTH = 'auth',
  DB = 'db',
  AI = 'ai',
  UPLOAD = 'upload',
  PAYMENT = 'payment',
  DEPLOY = 'deploy'
}

export interface UserRole {
  roleName: string;
  description: string;
  primaryDevice: DeviceType;
}

export interface SuccessMetric {
  metricName: string;
  timeframe: Timeframe;
  measurableValue: string;
}

export interface UserFlow {
  name: string;
  initiatingRole: string;
  entryPoint: string;
  steps: string[];
  endState: string;
  failurePoints: string[];
}

export interface Page {
  pageName: string;
  purpose: string;
  primaryCTA: string;
  contentOwner: ContentOwner;
}

export interface DataField {
  fieldName: string;
  type: FieldType;
  required: boolean;
}

export interface Entity {
  name: string;
  fields: DataField[];
  ownerRole: string;
  visibility: Visibility;
  retentionPolicy: RetentionPolicy;
  relationships: string[];
}

export interface Integration {
  name: string;
  purpose: string;
  dataDirection: DataDirection;
  authMethod: string;
  failureBehavior: IntegrationFailureBehavior;
  exitStrategy: string;
}

export interface Milestone {
  name: string;
  order: number;
  deliverable: string;
  acceptanceCriteria: string[];
}

export interface ArchitectureSpec {
  status: 'draft' | 'locked';
  contextNotes: string; // Unstructured brain dump area
  projectMeta: {
    projectName: string;
    ownerName: string;
    ownerEmail: string; // Captured email
    ownerRole: OwnerRole;
    createdAt: string;
    version: string;
  };
  definition: {
    productType: ProductType;
    oneSentence: string;
    jobToBeDone: string;
  };
  users: {
    roles: UserRole[];
    regions: string[];
    languages: string[];
    accessibilityRequired: boolean;
    expectedUsers: {
      now: number;
      in12Months: number;
    };
  };
  success: {
    metrics: SuccessMetric[];
    nonGoals: string[];
    niceToHaves: string[];
  };
  flows: UserFlow[];
  features: {
    mustHave: string[];
    shouldHave: string[];
    couldHave: string[];
    wontHave: string[];
  };
  content: {
    pages: Page[];
    branding: {
      colors: string[];
      fonts: string[];
      tone: string;
      forbiddenPhrases: string[];
    };
  };
  dataModel: Entity[];
  stateRules: {
    durableData: string[]; // entity names
    ephemeralData: string[];
    sourceOfTruth: Record<string, string>;
    readOnlyOnFailure: boolean;
    offlineSupport: boolean;
  };
  permissions: Record<string, Record<string, string[]>>; // role -> entity -> [C,R,U,D]
  integrations: Integration[];
  aiPolicy: {
    allowed: {
      suggest: boolean;
      generateDrafts: boolean;
      generateFinal: boolean;
      executeActions: boolean;
    };
    forbidden: {
      schemaChanges: true;
      deleteData: boolean;
      permissionChanges: true;
      deployCode: true;
    };
    approvalRequiredFor: string[];
    validationRules: string[];
    auditLogEnabled: boolean;
  };
  failureModes: Record<FailureSystem, string>;
  performance: {
    concurrentUsersTarget: number;
    maxUploadSizeMB: number;
    pageLoadTargetMs: number;
    cdnRequired: boolean;
  };
  security: {
    sensitiveDataTypes: string[];
    twoFactorRequired: boolean;
    auditLogsRequired: boolean;
    dataExportRequired: boolean;
    regulatoryRequirements: string[];
  };
  operations: {
    deployOwner: string;
    backupFrequency: BackupFrequency;
    restoreTestFrequency: string;
    monitoringEvents: string[];
    adminToolsRequired: string[];
  };
  buildPlan: Milestone[];
  changeControl: {
    whoCanChangeRequirements: string[];
    allowedMidBuildChanges: string[];
    rearchitectureTriggers: string[];
    schemaVersioningStrategy: string;
  };
  assumptions: {
    description: string;
    owner: string;
    expiryDate: string;
  }[];
}
