"use client";

import { describeFeePlan, formatDays, formatTimeRange } from "@chukta/shared";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import { InvoiceList, showDate } from "@/components/fees/InvoiceList";
import { getBatch, listStudents, type Batch, type StudentSummary } from "@/lib/api";
import { copy } from "@/lib/copy";

/** One batch (the Batches design canvas's detail page): its schedule and plan, its students now, and its bills. */
export function BatchDetail({ token, id }: { token: string; id: string }) {
  const t = copy.batch;
  const studentsId = useId();
  const feesId = useId();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [missing, setMissing] = useState(!id);

  useEffect(() => {
    if (!id) return;
    getBatch(token, id).then(setBatch, () => setMissing(true));
    listStudents(token, { status: "active", batchId: id }).then(({ students: found }) => setStudents(found), () => setStudents([]));
  }, [token, id]);

  if (missing) {
    return (
      <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
        <Typography>{t.notFound}</Typography>
        <Link component={NextLink} href="/batches">
          {t.back}
        </Link>
      </Stack>
    );
  }
  if (!batch) return null;

  const schedule = [batch.subject, formatDays(batch.days), formatTimeRange(batch.startTime, batch.endTime)].filter(Boolean).join(" · ");

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <Stack spacing={0.5}>
          <Typography variant="h3" component="h1">
            {batch.name}
          </Typography>
          <Typography color="text.secondary">{schedule}</Typography>
          <Typography color="text.secondary">{batch.feePlan ? describeFeePlan(batch.feePlan) : t.noPlan}</Typography>
        </Stack>
        <Button component={NextLink} href={`/batches/edit?id=${batch.id}`} variant="outlined">
          {t.edit}
        </Button>
      </Stack>

      <Card component="section" aria-labelledby={studentsId} sx={{ overflowX: "auto" }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, pt: 2, pb: 1 }}>
          <Typography id={studentsId} variant="h4" component="h2">
            {t.students}
          </Typography>
          <Button component={NextLink} href="/students/new">
            {t.addStudent}
          </Button>
        </Stack>
        {students && students.length === 0 && (
          <Typography color="text.secondary" sx={{ px: { xs: 2, md: 3 }, pb: 2 }}>
            {t.noStudents}
          </Typography>
        )}
        {students && students.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t.colStudent}</TableCell>
                <TableCell>{t.colParent}</TableCell>
                <TableCell>{t.colSince}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => {
                const since = student.batches.find((b) => b.id === batch.id)?.since;
                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Link component={NextLink} href={`/students/edit?id=${student.id}`}>
                        {student.name}
                      </Link>
                    </TableCell>
                    <TableCell>{student.parentName}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{since ? showDate(since) : ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Box component="section" aria-labelledby={feesId}>
        <Typography id={feesId} variant="h4" component="h2" sx={{ mb: 2 }}>
          {t.fees}
        </Typography>
        <InvoiceList token={token} batchId={batch.id} />
      </Box>
    </Stack>
  );
}
