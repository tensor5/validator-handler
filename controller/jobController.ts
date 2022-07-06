"use strict";
import dotenv from "dotenv";
dotenv.config();

import { Job } from "../types/models";
import { mappedJob, updatePreserveBody } from "../types/job";
import { Op, Sequelize } from "sequelize";
import { entityController } from "./entityController";
import { preserveReasons } from "../database/models/job";
import { define as jobDefine } from "../database/models/job";

export class jobController {
  db: Sequelize;

  constructor(db: Sequelize) {
    this.db = db;
  }

  async list(
    entityExternalId: string,
    dateFrom,
    dateTo,
    page,
    limit
  ): Promise<{
    totalElements: number;
    currentPage: number;
    pages: number;
    jobs: mappedJob[];
  }> {
    const returnValues = {
      totalElements: 0,
      currentPage: parseInt(page),
      pages: 0,
      jobs: [],
    };

    if ((Boolean(dateFrom) && !dateTo) || (!dateFrom && Boolean(dateTo))) {
      throw new Error("dateFrom and dateTo both must be passed or neither");
    }

    const entityObj = await new entityController(this.db).retrieve(
      entityExternalId
    );

    if (entityObj === null || parseInt(limit) <= 0) {
      return returnValues;
    }

    let condition = {};
    if (Boolean(dateFrom) && Boolean(dateTo)) {
      condition = {
        where: {
          updatedAt: {
            [Op.between]: [dateFrom, dateTo],
          },
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    const countData = await entityObj.getJobs(condition);
    let cont = 0;
    countData.forEach((job) => {
      if (job) {
        cont++;
      }
    });

    const pages = Math.ceil(cont / limit);
    const offset = limit * (page - 1);
    condition = {
      ...condition,
      ...{
        offset: offset,
        limit: limit,
      },
    };

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore - getJobs(): metodo autogenerato dall'ORM Sequelize dopo l'associazione
    const jobList: Job[] = await entityObj.getJobs(condition);

    const jobElements = [];
    jobList.forEach((job) => {
      const jobElement = job.toJSON();
      jobElements.push({
        id: jobElement.id,
        startAt: jobElement.start_at,
        endAt: jobElement.end_at,
        scanUrl: jobElement.scan_url,
        type: jobElement.type,
        status: jobElement.status,
        s3HTMLUrl: jobElement.s3_html_url,
        s3JSONUrl: jobElement.s3_json_url,
        s3CleanJSONUrl: jobElement.s3_clean_json_result_url,
        jsonResult: jobElement.json_result,
        preserve: jobElement.preserve,
      });
    });

    returnValues.totalElements = cont;
    returnValues.pages = pages;
    returnValues.currentPage = parseInt(page);
    returnValues.jobs = jobElements;

    return returnValues;
  }

  async updatePreserve(
    entityExternalId: string,
    jobId: number,
    updatePreserve: updatePreserveBody
  ): Promise<Job> {
    const entityObj = await new entityController(this.db).retrieve(
      entityExternalId
    );

    if (entityObj === null) {
      throw new Error("Entity not found");
    }

    if (!preserveReasons.includes(updatePreserve.reason)) {
      throw new Error("Preserve reason not valid");
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore - getJobs(): metodo autogenerato dall'ORM Sequelize dopo l'associazione
    const jobObjs: Job[] = await entityObj.getJobs({
      where: {
        id: jobId,
      },
    });

    if (jobObjs.length > 1) {
      throw new Error("Multiple job found for the passed ids");
    }

    if (jobObjs.length <= 0) {
      throw new Error("Job not found");
    }

    return await jobObjs[0].update({
      preserve: updatePreserve.value,
      preserve_reason: updatePreserve.reason,
    });
  }

  async cleanJobs(entityId: number): Promise<number[]> {
    const jobAmountToPreserve = parseInt(process.env.JOB_AMOUNT_TO_PRESERVE);

    const jobs = await jobDefine(this.db).findAll({
      where: {
        entity_id: entityId,
        preserve: false,
      },
      order: [["updatedAt", "ASC"]],
    });

    let jobToDelete = 0;
    if (jobs.length > jobAmountToPreserve) {
      jobToDelete = jobs.length - jobAmountToPreserve;
    }

    const jobDeleted = [];
    for (let i = 0; i < jobToDelete; i++) {
      jobDeleted.push(jobs[i].id);
      await jobs[i].destroy();
    }

    return jobDeleted;
  }
}
