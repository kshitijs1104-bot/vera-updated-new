import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import reportsRouter from "./reports";
import companiesRouter from "./companies";
import signalsRouter from "./signals";
import thoughtsRouter from "./thoughts";
import aiRouter from "./ai";
import settingsRouter from "./settings";
import stocksRouter from "./stocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(reportsRouter);
router.use(companiesRouter);
router.use(signalsRouter);
router.use(thoughtsRouter);
router.use(aiRouter);
router.use(settingsRouter);
router.use(stocksRouter);

export default router;
