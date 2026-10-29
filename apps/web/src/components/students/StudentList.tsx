"use client";

import { formatIndianMobile } from "@chukta/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { listBatches, listStudents, type StudentFilters, type StudentSummary } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";

type Status = StudentFilters["status"];

/** Waits for typing to pause before searching. */
const SEARCH_DELAY_MS = 300;

/** The centre's students, filtered by status, batch and a search of names. */
export function StudentList({ token }: { token: string }) {
  const t = copy.students;
  const [status, setStatus] = useState<Status>("active");
  const [batchId, setBatchId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const filters: StudentFilters = { status, ...(batchId && { batchId }), ...(q && { q }) };
  const filtered = status !== "active" || Boolean(batchId) || Boolean(q);

  useEffect(() => {
    listBatches(token, { status: "active" }).then(
      ({ batches: found }) => setBatches(found),
      () => undefined,
    );
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    listStudents(token, { status, ...(batchId && { batchId }), ...(q && { q }) }).then(
      (page) => {
        if (cancelled) return;
        setStudents(page.students);
        setCursor(page.nextCursor);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [token, status, batchId, q]);

  async function showMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listStudents(token, { ...filters, cursor });
      setStudents((current) => [...(current ?? []), ...page.students]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" } }}>
        <TextField
          type="search"
          label={t.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label={t.batchFilter}
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
          fullWidth={false}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t.allBatches}</MenuItem>
          {batches.map((batch) => (
            <MenuItem key={batch.id} value={batch.id}>
              {batch.name}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          aria-label={t.statusFilter}
          value={status}
          onChange={(_event, value: Status | null) => value && setStatus(value)}
        >
          <ToggleButton value="active">{t.statusActive}</ToggleButton>
          <ToggleButton value="left">{t.statusLeft}</ToggleButton>
          <ToggleButton value="all">{t.statusAll}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {students && students.length === 0 && (
        <Typography color="text.secondary">{filtered ? t.noMatch : t.empty}</Typography>
      )}

      {students && students.length > 0 && (
        <Card>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t.colStudent}</TableCell>
                  <TableCell>{t.colParent}</TableCell>
                  <TableCell>{t.colPhone}</TableCell>
                  <TableCell>{t.colBatches}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} hover>
                    <TableCell>
                      <Link component={NextLink} href={`/students/edit?id=${student.id}`} sx={{ fontWeight: 700 }}>
                        {student.name}
                      </Link>
                    </TableCell>
                    <TableCell>{student.parentName}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatIndianMobile(student.parentPhone)}</TableCell>
                    <TableCell>
                      {student.batches.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {t.noBatch}
                        </Typography>
                      ) : (
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                          {student.batches.map((batch) => (
                            <Chip key={batch.id} label={batch.name} variant="outlined" />
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}

      {cursor && (
        <Box>
          <Button variant="outlined" loading={loadingMore} onClick={showMore}>
            {t.more}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
