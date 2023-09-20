FROM public.ecr.aws/lambda/nodejs:18

COPY ./build/ ./

CMD [ "index.dispatch" ]
