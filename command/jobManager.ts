"use strict";

import dotenv from "dotenv";
dotenv.config();

import { db } from "../database/connection";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { QueryTypes } from "sequelize";
import dateFormat from "dateformat";
import { define as entityDefine } from "../database/models/entity";
import { define as jobDefine } from "../database/models/job";
import { Queue } from 'bullmq';

const command = yargs(hideBin(process.argv))
  .usage(
    "Usage: --maxItems <maxItems> --passedOlderThanDays <passedOlderThanDays> --failedOlderThanDays <failedOlderThanDays>"
  ).option("maxItems", {
    describe: "Numero massimo di entity da analizzare",
    type: "integer",
    demandOption: true,
    default: 100,
  })
  .option("passedOlderThanDays", {
    describe:
      "Giorni dopo i quali le entity con Job che ha fornito risultato PASSED vengono riaccodate per essere scansionate",
    type: "integer",
    demandOption: true,
    default: 28,
  })
  .option("failedOlderThanDays", {
    describe:
      "Giorni dopo i quali le entity con Job che ha fornito risultato FAILED vengono riaccodate per essere scansionate",
    type: "integer",
    demandOption: true,
    default: 14,
  }).argv;

db.authenticate()
  .then(async () => {
    console.log(`[DB-SYNC]: Database ${db.getDatabaseName()} connected!`);

      const crawlerQueue = new Queue('crawler-queue', { connection: {
              host: process.env.REDIS_HOST,
              port: process.env.REDIS_PORT
      }});

    const passedOlderThanDays: number = parseInt(command.passedOlderThanDays);
    const failedOlderThanDays: number = parseInt(command.failedOlderThanDays);
    const maxItems: number = parseInt(command.maxItems);

    const firstTimeEntityToBeAnalyzed = await getFirstTimeEntityToBeAnalyzed(
        maxItems
    );

    let rescanEntityToBeAnalyzed = [];
    const gapLimit: number = maxItems - firstTimeEntityToBeAnalyzed.length;
    if (gapLimit > 0) {
      rescanEntityToBeAnalyzed = await getRescanEntityToBeAnalyzed(
        passedOlderThanDays,
        failedOlderThanDays,
        gapLimit
      );
    }

    const totalEntities = [
      ...firstTimeEntityToBeAnalyzed,
      ...rescanEntityToBeAnalyzed,
    ];

    console.log('TOTAL ENTITIES', totalEntities.length)

    if (totalEntities.length > 0) {
        await generateJobs(totalEntities, crawlerQueue);
    }

    const counts = await crawlerQueue.getJobCounts('wait', 'completed', 'failed');
    console.log('QUEUE STATUS', counts)
  })
  .catch((err) => {
    console.error("[DB-SYNC]: Unable to connect to the database:", err);
  });

const getFirstTimeEntityToBeAnalyzed = async (limit: number) => {
  let returnValues = [];

  const firstTimeEntityToBeAnalyzed = await db.query(
    'SELECT E.id FROM "Entities" as E LEFT JOIN "Jobs" as J ON E.id = J.entity_id WHERE J.id IS NULL LIMIT :limit',
    {
      replacements: { limit: limit },
      type: QueryTypes.RAW,
    }
  );

  if (firstTimeEntityToBeAnalyzed[0].length > 0) {
    returnValues = firstTimeEntityToBeAnalyzed[0];
  }

  return returnValues;
};

const getRescanEntityToBeAnalyzed = async (
  passedOlderThanDays: number,
  failedOlderThanDays: number,
  limit: number
) => {
  let returnValues = [];

  const passedDate = new Date();
  passedDate.setDate(passedDate.getDate() + passedOlderThanDays);

  const failedDate = new Date();
  failedDate.setDate(failedDate.getDate() + failedOlderThanDays);

  const rescanEntityToBeAnalyzed = await db.query(
    `SELECT E.id\
                 FROM "Entities" AS E\
                 JOIN "Jobs" J1 ON (E.id = J1.entity_id)\
                 LEFT OUTER JOIN "Jobs" J2 ON (E.id = J2.entity_id AND\
                 (J1."updatedAt" < J2."updatedAt" OR (J1."updatedAt" = J2."updatedAt" AND J1.id < J2.id)))\
                 WHERE J2.id IS NULL\ 
                    AND (J1.status='ERROR'\ 
                        OR (J1.status = 'PASSED' AND DATE(J1."updatedAt") > DATE(:passedDate))\
                        OR (J1.status = 'FAILED' AND DATE(J1."updatedAt") > DATE(:failedDate))\
                    )\
                 ORDER BY J1.status DESC, J1."updatedAt" LIMIT :limit`,
    {
      replacements: {
        limit: limit,
        passedDate: dateFormat(passedDate, "yyyy-mm-dd"),
        failedDate: dateFormat(failedDate, "yyyy-mm-dd"),
      },
      type: QueryTypes.RAW,
    }
  );

  if (rescanEntityToBeAnalyzed[0].length > 0) {
    returnValues = rescanEntityToBeAnalyzed[0];
  }

  return returnValues;
};

const generateJobs = async (
  entities,
  crawlerQueue
): Promise<void> => {

  let jobs
  for (let entity of entities) {
      try {
          const entityObj: any = await entityDefine().findByPk(entity.id);
          if (entityObj === null) {
              continue;
          }

          const entityParse = entityObj.toJSON()
          const jobObj = await jobDefine(false).create({
              entity_id: entityParse.id,
              start_at: null,
              end_at: null,
              scan_url: entityParse.url,
              type: entityParse.type,
              status: "PENDING",
              s3_html_url: null,
              s3_json_url: null,
              json_result: null,
          });
          const parsedJob = jobObj.toJSON()

          jobs = await crawlerQueue.addBulk([
              { name: 'job', data: { id: parsedJob.id } },
          ]);
      } catch (e) {
          console.log(e)
      }
  }
};
