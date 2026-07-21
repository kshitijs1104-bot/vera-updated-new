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
import chatsRouter from "./chats";
import goalsRouter from "./goals";
import companyFactsRouter from "./companyFacts";
import roadmapsRouter from "./roadmaps";
import dailyBriefRouter from "./dailyBrief";

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
router.use(chatsRouter);
router.use(goalsRouter);
router.use(companyFactsRouter);
router.use(roadmapsRouter);
router.use(dailyBriefRouter);

export default router;
