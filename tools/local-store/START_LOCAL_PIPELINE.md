# Pipeline Explorer local SQLite launcher

This command file imports the current local Google Drive-synced master, terminal archive, and evidence companion into SQLite, starts the local SQLite API, starts a local static app server, then opens Pipeline Explorer using the bounded SQLite source.

Run from File Explorer or Command Prompt:

```cmd
tools\local-store\start_pipeline_local.cmd
```

It opens:

```text
http://127.0.0.1:8080/pipeline.html?src=local
```

It uses bounded reads from:

```text
http://127.0.0.1:8765/api/jobs?mode=source&limit=250&offset=0
```

No Writer writes, Apps Script calls, Google Docs runtime reads, or Google Drive runtime reads are performed by the UI after the import step.
