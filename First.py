from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles 
from fastapi.responses import FileResponse,JSONResponse, StreamingResponse
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer
import threading
import os
from websearch import websearch
    

class App:

    def __init__(self):
      self.app=FastAPI()
      self.app.mount("/static",StaticFiles(directory="./src/front_end_static_files"),name="static")
      self.model="llama2"
      self.template=f"""You are a helpful assistant whose goal is to support the user with their questions and requests. Your responses should be broken into multiple clear, concise sentences. Additionally, include relevant emojis to make the conversation engaging and friendly, Also do not Include the word "assistant" while responding"""
      self.system_prompt={'role':'system','content':self.template}
      self.max_history_onmem=20
      self.chat_history=[]
      self.n_chats=5
      self.router()
      self.model_dir="./Models3.2"
      self.model=AutoModelForCausalLM.from_pretrained(self.model_dir)
      self.tokenizer=AutoTokenizer.from_pretrained(self.model_dir)
      self.ws=websearch()
      self.streamer=TextIteratorStreamer(self.tokenizer,skip_prompt=True,skip_special_tokens=True)
    def router(self):
            @self.app.get("/")
            def serve_index():
                  return FileResponse(os.path.join("src","front_end_static_files","index.html"))
            
            @self.app.post("/chat")
            async def chat_endpoint(request: Request):
                  data=await request.json()
                  message=data.get("message")
                  internet=data.get("internet")
                  tool_response=""
                  if internet:
                        tool_response=self.web_search(message)     
                  thread=self.llm_calling(message,tool_response)
                  def generate():
                        response=""
                        Fir=1
                        for token in self.streamer:
                              if Fir and token.strip() == "assistant":
                                    Fir=0
                                    continue
                              yield token + " "
                              response+=token
                        con={'user':message,'assistant':response}
                        self.current_session_chat(con)
                        thread.join()
                  return StreamingResponse(generate(),media_type="text/plain")
    
    def web_search(self,mes: str):
      out=self.ws.retrive_contents(mes)
      tool_response="Here are some results from internet: "
      for i in out:
            tool_response+=i['snippet']
      
      return tool_response


    def llm_calling(self,mes: str, tool_mes: str):
      message=[]
      message=self.pre_processing_request(message)
      message.append({"role":"user","content":mes})
      if tool_mes:
            message.append({"role":"assistant","content":tool_mes})
      tokens=self.tokenizer.apply_chat_template(message,tokenize=False,add_special_tokens=False)
      inputs=self.tokenizer(tokens,return_tensors="pt").to(self.model.device)
      def generate_model():
            self.model.generate(
                  **inputs,
                  max_new_tokens=5000,
                  temperature=0.7,
                  top_p=0.9,
                  do_sample=True,
                  pad_token_id=self.tokenizer.eos_token_id,
                  eos_token_id=self.tokenizer.eos_token_id,
                  streamer=self.streamer
            )
      thread=threading.Thread(target=generate_model)      
      thread.start()
      return thread
   
    def current_session_chat(self,content: dict):

      if len(self.chat_history)>self.max_history_onmem:
            del self.chat_history[:2]
      
      self.chat_history.append(content)
    
    def pre_processing_request(self, message: list) -> list:
      ln=len(self.chat_history)
      message.append(self.system_prompt)
      if ln>=self.n_chats:
            me=self.chat_history[ln-self.n_chats:]
            for i in range(len(me)):
                  x=me[i]
                  message.append({'role':'user','content':x['user']})
                  message.append({'role':'assistant','content':x['assistant']})
      else:
            for i in range(len(self.chat_history)):
                  x=self.chat_history[i]
                  message.append({'role':'user','content':x['user']})
                  message.append({'role':'assistant','content':x['assistant']})
      return message


application=App()
app_call=application.app




