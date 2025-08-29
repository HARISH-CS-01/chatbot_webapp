import requests
import json

class websearch():
    def __init__(self):
        self.api_key='<API>'
        self.cx_id='<cx_id>'
        self.url="https://www.googleapis.com/customsearch/v1"
    
    def retrive_contents(self,query):
        params={
                "q":query,
                "cx":self.cx_id,
                "key":self.api_key
            }
        try:
            result=requests.get(self.url,params)
        except Exception as e:
            return "Error "+ str(e)
        
        result=result.json()
        out=[]
        for i in result['items']:
            x={
            "link":i['link'],
            "snippet":i['snippet']
            }
            out.append(x)
        
        return out 