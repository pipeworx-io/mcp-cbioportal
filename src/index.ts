interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * cBioPortal MCP — cancer genomics portal.
 *
 * Search public cancer studies (TCGA / CPTAC / etc.) by keyword, get study
 * details + sample counts, resolve a gene symbol to an Entrez id, and list
 * cancer types. Complements the GDC pack. Keyless, open data.
 *
 * Wraps the public cBioPortal REST API (https://www.cbioportal.org/api),
 * which returns plain JSON arrays/objects (no envelope).
 */


const BASE = 'https://www.cbioportal.org/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_studies',
    description:
      'Search public cancer genomics studies in cBioPortal (TCGA, CPTAC, MSK, etc.) by keyword. Matches study name, study id, or cancer-type id (case-insensitive). Returns study ids, names, cancer types, and sample counts. Keyless, open data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against study name / id / cancer type (e.g. "breast", "tcga", "glioma"). Omit to list studies.' },
        limit: { type: 'number', description: 'Max studies to return (default 25, max 100).' },
      },
    },
  },
  {
    name: 'get_study',
    description:
      'Get full details for one cBioPortal cancer study by its study id (e.g. "brca_tcga_pub", "glioma_mskcc_2019"), including description, cancer type, sample count, PMID, and citation.',
    inputSchema: {
      type: 'object',
      properties: {
        study_id: { type: 'string', description: 'cBioPortal study id, e.g. "brca_tcga_pub".' },
      },
      required: ['study_id'],
    },
  },
  {
    name: 'get_gene',
    description:
      'Resolve a gene to its Entrez gene id and canonical info via cBioPortal. Accepts a HUGO symbol (e.g. "TP53", "BRCA1") or an Entrez gene id. Returns entrez_gene_id, symbol, and type.',
    inputSchema: {
      type: 'object',
      properties: {
        gene: { type: 'string', description: 'HUGO gene symbol (e.g. "TP53") or Entrez gene id.' },
      },
      required: ['gene'],
    },
  },
  {
    name: 'list_cancer_types',
    description:
      'List cancer types defined in cBioPortal (id, display name, parent type). Useful for resolving cancer-type ids used by studies.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max cancer types to return (default 50, max 200).' },
      },
    },
  },
];

interface CbioStudy {
  studyId?: string;
  name?: string;
  description?: string;
  cancerTypeId?: string;
  allSampleCount?: number;
  publicStudy?: boolean;
  pmid?: string;
  citation?: string;
  referenceGenome?: string;
}

interface CbioGene {
  entrezGeneId?: number;
  hugoGeneSymbol?: string;
  type?: string;
}

interface CbioCancerType {
  cancerTypeId?: string;
  name?: string;
  dedicatedColor?: string;
  parent?: string;
}

function clampNum(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.max(min, Math.min(max, n));
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing.`);
  }
  return v.trim();
}

async function cbioGet(path: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function mapStudy(s: CbioStudy) {
  return {
    study_id: s.studyId,
    name: s.name,
    cancer_type: s.cancerTypeId,
    samples: s.allSampleCount,
    pmid: s.pmid,
    reference_genome: s.referenceGenome,
  };
}

async function searchStudies(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampNum(args.limit, 25, 1, 100);
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

  // Fetch a large page and filter client-side (API has no keyword search).
  let resp = await cbioGet('/studies?pageSize=500&pageNumber=0&direction=ASC&projection=SUMMARY');
  if (!resp.ok || !Array.isArray(resp.data)) {
    // Fall back to a smaller page if the large fetch failed.
    resp = await cbioGet('/studies?pageSize=100&pageNumber=0&direction=ASC&projection=SUMMARY');
  }
  if (!resp.ok) {
    return { error: `cBioPortal: ${resp.status}` };
  }
  const all = Array.isArray(resp.data) ? (resp.data as CbioStudy[]) : [];

  let filtered = all;
  if (query) {
    filtered = all.filter((s) => {
      const hay = `${s.name ?? ''} ${s.studyId ?? ''} ${s.cancerTypeId ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }

  const studies = filtered.slice(0, limit).map(mapStudy);
  return { count: studies.length, studies };
}

async function getStudy(args: Record<string, unknown>): Promise<unknown> {
  const studyId = reqStr(args, 'study_id');
  const resp = await cbioGet(`/studies/${encodeURIComponent(studyId)}`);
  if (resp.status === 404) {
    return { error: 'study not found', study_id: studyId };
  }
  if (!resp.ok || !resp.data || typeof resp.data !== 'object') {
    return { error: `cBioPortal: ${resp.status}`, study_id: studyId };
  }
  const s = resp.data as CbioStudy;
  return {
    study_id: s.studyId,
    name: s.name,
    description: s.description,
    cancer_type: s.cancerTypeId,
    samples: s.allSampleCount,
    pmid: s.pmid,
    citation: s.citation,
    reference_genome: s.referenceGenome,
  };
}

async function getGene(args: Record<string, unknown>): Promise<unknown> {
  const gene = reqStr(args, 'gene');
  const resp = await cbioGet(`/genes/${encodeURIComponent(gene)}`);
  if (resp.status === 404) {
    return { error: 'gene not found', gene };
  }
  if (!resp.ok || !resp.data || typeof resp.data !== 'object') {
    return { error: `cBioPortal: ${resp.status}`, gene };
  }
  const g = resp.data as CbioGene;
  return {
    entrez_gene_id: g.entrezGeneId,
    symbol: g.hugoGeneSymbol,
    type: g.type,
  };
}

async function listCancerTypes(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampNum(args.limit, 50, 1, 200);
  const resp = await cbioGet(`/cancer-types?pageSize=${encodeURIComponent(String(limit))}`);
  if (!resp.ok) {
    return { error: `cBioPortal: ${resp.status}` };
  }
  const arr = Array.isArray(resp.data) ? (resp.data as CbioCancerType[]) : [];
  const cancer_types = arr.slice(0, limit).map((c) => ({
    id: c.cancerTypeId,
    name: c.name,
    parent: c.parent,
  }));
  return { count: cancer_types.length, cancer_types };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_studies':
        return await searchStudies(args);
      case 'get_study':
        return await getStudy(args);
      case 'get_gene':
        return await getGene(args);
      case 'list_cancer_types':
        return await listCancerTypes(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
