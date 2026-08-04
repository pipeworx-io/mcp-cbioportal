# mcp-cbioportal

cBioPortal MCP — cancer genomics portal.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_studies` | Search public cancer genomics studies in cBioPortal (TCGA, CPTAC, MSK, etc.) by keyword. Matches study name, study id, or cancer-type id (case-insensitive). Returns study ids, names, cancer types, and sample counts. Keyless, open data. |
| `get_study` | Get full details for one cBioPortal cancer study by its study id (e.g. "brca_tcga_pub", "glioma_mskcc_2019"), including description, cancer type, sample count, PMID, and citation. |
| `get_gene` | Resolve a gene to its Entrez gene id and canonical info via cBioPortal. Accepts a HUGO symbol (e.g. "TP53", "BRCA1") or an Entrez gene id. Returns entrez_gene_id, symbol, and type. |
| `list_cancer_types` | List cancer types defined in cBioPortal (id, display name, parent type). Useful for resolving cancer-type ids used by studies. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "cbioportal": {
      "url": "https://gateway.pipeworx.io/cbioportal/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Cbioportal data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
