"use strict";

import { Entity } from "../types/models";
import { createBody, updateBody } from "../types/entity";
import { define as entityDefine } from "../database/models/entity";
import { Model, Sequelize } from "sequelize";

export class entityController {
  db

  constructor(db: Sequelize) {
    this.db = db;
  }

  async retrieve (entityExternalId: string): Promise<Model<Entity, Entity>> {
    return await entityDefine(this.db).findOne({
      where: {
        external_id: entityExternalId,
      },
    });
  };

  async create (entityCreateBody: createBody): Promise<Entity> {
    const entity = await this.retrieve(entityCreateBody.external_id);
    if (entity !== null) {
      throw new Error("Entity already exists for the passed id");
    }

    const result = await entityDefine(this.db).create({
      external_id: entityCreateBody.external_id,
      url: entityCreateBody.url,
      enable: entityCreateBody.enable,
      type: entityCreateBody.type,
    });

    return result.toJSON();
  };

  async update (entityExternalId: string, entityUpdateBody: updateBody): Promise<Entity> {
    const entity: Model<Entity, Entity> = await this.retrieve(entityExternalId);
    if (entity === null) {
      throw new Error("Entity does not exists");
    }

    let updateObj = {};

    if ("url" in entityUpdateBody) {
      updateObj = { ...updateObj, ...{ url: entityUpdateBody.url } };
    }

    if ("enable" in entityUpdateBody) {
      updateObj = { ...updateObj, ...{ enable: entityUpdateBody.enable } };
    }

    const result = await entity.update(updateObj);

    return result.toJSON();
  };
}